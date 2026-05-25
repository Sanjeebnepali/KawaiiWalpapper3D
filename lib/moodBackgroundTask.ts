/**
 * Background mood task — the "auto-change wallpaper even when app is closed"
 * runtime.
 *
 * Uses `expo-background-fetch` + `expo-task-manager`. The task name is a
 * top-level constant so the OS can dispatch to it after process reboot.
 * The handler:
 *
 *   1. Reads context signals (time, weekday, recent steps).
 *   2. Infers a mood via `inferContextMoodNow` (no camera — that's blocked
 *      in background).
 *   3. If the mood differs from the last background-applied mood, picks a
 *      photo from the active Mood Collection via the existing
 *      `applyMoodPhotoFromCollection` and sets it as the wallpaper.
 *   4. Reports the mood to the mood store so the next time the user opens
 *      the app, the UI is already in sync.
 *
 * OS cadence: Android WorkManager and iOS Background App Refresh both
 * decide the actual interval based on battery + usage patterns. The
 * `minimumInterval` we request is a floor (15 min on Android, suggestion
 * only on iOS). Real-world cadence is typically 30 min – 4 h.
 */

import { type MoodId } from '../constants/moods';
import { hydrateMoodStore, useMoodStore } from '../store/mood';
import { hydrateSettingsStore } from '../store/settings';
import { hydrateShuffleStore } from '../store/shuffle';
import { inferContextMoodNow } from './contextMood';
import { applyMoodPhotoFromCollection } from './moodEngineActions';
import { recordMood } from './moodHistory';
import {
  type BackgroundFetchLike,
  type TaskManagerLike,
} from './moodBackgroundTask.types';
import { localDayKey, runSleepWakeFallback } from './moodSleepWakeFallback';
import { runShuffleBackgroundOnce } from './shuffleActions';
import { recentSteps } from './stepCount';

// NOTE: the UsageStats "app-open detection" path (changes/034) has been
// removed from this task as of changes/036 — the user found it useless in
// practice (background polling delay was 15–30 min, foreground polling
// duplicated what the new Friend Check-in tier does better). The
// `lib/appUsageMonitor.ts` + `modules/usage-stats/` files are intentionally
// left on disk in case we want to revive it; nothing references them.

export const MOOD_BACKGROUND_TASK = 'kawaii.mood.background.v1';

let taskManagerMod: TaskManagerLike | null = null;
let backgroundFetchMod: BackgroundFetchLike | null = null;
let taskDefined = false;

function getModules(): {
  tm: TaskManagerLike | null;
  bf: BackgroundFetchLike | null;
} {
  if (!taskManagerMod) {
    try {

      taskManagerMod = require('expo-task-manager') as TaskManagerLike;
    } catch {
      taskManagerMod = null;
    }
  }
  if (!backgroundFetchMod) {
    try {

      backgroundFetchMod = require('expo-background-fetch') as BackgroundFetchLike;
    } catch {
      backgroundFetchMod = null;
    }
  }
  return { tm: taskManagerMod, bf: backgroundFetchMod };
}

/**
 * Define the task at module load (top-level, NOT inside a component).
 * `expo-task-manager` requires the handler to be registered before the JS
 * runtime services any background dispatch, which on a cold relaunch from
 * the OS happens early — before any React tree mounts.
 */
function ensureTaskDefined(): boolean {
  if (taskDefined) return true;
  const { tm, bf } = getModules();
  if (!tm?.defineTask || !bf?.BackgroundFetchResult) return false;

  tm.defineTask(MOOD_BACKGROUND_TASK, async () => {
    try {
      const ran = await runMoodBackgroundOnce();
      return ran
        ? bf.BackgroundFetchResult!.NewData
        : bf.BackgroundFetchResult!.NoData;
    } catch (e) {
      if (__DEV__) console.warn('[MoodBgTask] failed:', e);
      return bf.BackgroundFetchResult!.Failed;
    }
  });
  taskDefined = true;
  return true;
}

/** Public — call from app bootstrap. Idempotent. */
export async function registerMoodBackgroundTask(
  // 15 min is Android WorkManager's hard FLOOR — anything lower is
  // silently rounded up by the OS. iOS uses this as a hint only. Lowered
  // from 30 min so users on aggressive shuffle intervals (5–10 min)
  // get the fastest cadence the OS will allow. Under Doze / battery
  // saver the actual cadence can stretch much longer; this is the
  // "as fast as you'll permit" ask, not a guarantee.
  minimumIntervalSec = 60 * 15,
): Promise<boolean> {
  if (!ensureTaskDefined()) return false;
  const { tm, bf } = getModules();
  if (!tm?.isTaskRegisteredAsync || !bf?.registerTaskAsync) return false;
  try {
    const already = await tm.isTaskRegisteredAsync(MOOD_BACKGROUND_TASK);
    if (already) return true;
    await bf.registerTaskAsync(MOOD_BACKGROUND_TASK, {
      minimumInterval: minimumIntervalSec,
      stopOnTerminate: false,
      startOnBoot: true,
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[MoodBgTask] register failed:', e);
    return false;
  }
}

export async function unregisterMoodBackgroundTask(): Promise<void> {
  const { tm, bf } = getModules();
  if (!tm?.isTaskRegisteredAsync || !bf?.unregisterTaskAsync) return;
  try {
    const already = await tm.isTaskRegisteredAsync(MOOD_BACKGROUND_TASK);
    if (already) await bf.unregisterTaskAsync(MOOD_BACKGROUND_TASK);
  } catch (e) {
    if (__DEV__) console.warn('[MoodBgTask] unregister failed:', e);
  }
}

/**
 * The actual work — exposed so the user can "Run now" from settings or the
 * Mood Home (handy for debugging).
 *
 * Returns true iff a new wallpaper was applied.
 */
export async function runMoodBackgroundOnce(): Promise<boolean> {
  // Cold-launched OS dispatch may invoke this BEFORE app/_layout.tsx's
  // bootstrap effect runs. All three stores expose idempotent hydrate
  // helpers; calling them here costs nothing on the warm path. Audit B1.
  // Settings is hydrated here too so the entitlement flags read the persisted
  // values — otherwise the bg-task short-circuits below.
  await Promise.all([
    hydrateMoodStore(),
    hydrateShuffleStore(),
    hydrateSettingsStore(),
  ]);

  const moodState = useMoodStore.getState();

  // ─── Theme-pack shuffle tick ────────────────────────────────────────
  // Runs FIRST and gated only by the shuffle store's own state (active
  // collection + interval + not paused + not DND). A free user who
  // started a theme-pack shuffle should still get auto-rotations while
  // the app is closed. If the shuffle tick applied a new wallpaper,
  // return early so the mood path doesn't immediately overwrite it
  // inside the same OS dispatch.
  const shuffleApplied = await runShuffleBackgroundOnce();
  if (shuffleApplied) return true;

  // ─── Sleep/Wake fallback ────────────────────────────────────────────
  // Subscription is the ENTRY gate (gateFeature('mood', …) at toggle-on time
  // in mood.tsx). Once a feature is on, the runtime loop must NOT re-check the
  // entitlement — if the user lapses their subscription, an already-running
  // engine should keep running until they explicitly turn it off.
  if (moodState.sleepWakeEnabled && moodState.sleepWakePackId) {
    const swApplied = await runSleepWakeFallback();
    if (swApplied) return true;
  }

  // Honour the master gates set by the user. Same rationale as above —
  // no runtime entitlement check; that lives at the toggle-on UI in
  // app/(tabs)/mood.tsx via gateFeature('mood', …).
  if (!moodState.backgroundEnabled) return false;
  if (!moodState.moodCollectionId) return false;

  // 1) Read background-friendly signals.
  const steps = await recentSteps(60);
  const ctx = inferContextMoodNow(steps);

  // 2) Same-mood handling is now USER-CONTROLLED (the "images change too
  //    frequently in the same category" fix):
  //    - rotateWithinMood OFF (default) → keep ONE photo per mood; only
  //      change the wallpaper when the inferred mood actually changes. We
  //      short-circuit here when the mood matches the last background mood.
  //    - rotateWithinMood ON → fall through every tick; `pickPhotoForMood`
  //      excludes `currentPhotoId`, so a same-mood tick rotates to a
  //      different photo in the same bucket (the lively behaviour the user
  //      can opt into).
  if (!moodState.rotateWithinMood && ctx.mood === moodState.lastBgMood) {
    return false;
  }

  // 3) Apply a fresh photo from the chosen Collection.
  const r = await applyMoodPhotoFromCollection(
    ctx.mood,
    moodState.moodCollectionId,
    moodState.currentPhotoId,
  );
  if (!r.ok || !r.photoId) return false;

  // 4) Persist enough state that the UI is in-sync when the user reopens.
  //    Same "throw away the history" bug fixed in moodNotifications.ts —
  //    push the returned history list into the in-memory store so any
  //    open Mood Home re-renders the new entry immediately (the user may
  //    be viewing the screen when the bg tick fires).
  await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
  await useMoodStore.getState().setLastBgMood(ctx.mood as MoodId);
  const nextHistory = await recordMood(ctx.mood as MoodId, 'background', ctx.confidence);
  useMoodStore.setState({
    currentMood: ctx.mood as MoodId,
    lastSource: 'background',
    lastConfidence: ctx.confidence,
    history: nextHistory,
  });

  return true;
}

// `localDayKey` lives in ./moodSleepWakeFallback now; re-exported here so
// external importers (lib/moodNotifications.ts) keep their import path.
export { localDayKey };

// Define the task as soon as this module is first imported (which the
// bootstrap file does at app start, well before any React mounts). This
// is required for cold-launch background dispatches to find the handler.
ensureTaskDefined();
