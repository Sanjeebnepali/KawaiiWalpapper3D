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
import {
  applyMoodPhotoFromCollection,
  applySleepWakePhoto,
} from './moodEngineActions';
import { recordMood } from './moodHistory';
import { runShuffleBackgroundOnce } from './shuffleActions';
import { recentSteps } from './stepCount';

// NOTE: the UsageStats "app-open detection" path (changes/034) has been
// removed from this task as of changes/036 — the user found it useless in
// practice (background polling delay was 15–30 min, foreground polling
// duplicated what the new Friend Check-in tier does better). The
// `lib/appUsageMonitor.ts` + `modules/usage-stats/` files are intentionally
// left on disk in case we want to revive it; nothing references them.

export const MOOD_BACKGROUND_TASK = 'kawaii.mood.background.v1';

type TaskManagerLike = {
  defineTask?: (name: string, handler: () => Promise<unknown>) => void;
  isTaskRegisteredAsync?: (name: string) => Promise<boolean>;
  unregisterTaskAsync?: (name: string) => Promise<void>;
};

type BackgroundFetchLike = {
  BackgroundFetchResult?: {
    NewData?: unknown;
    NoData?: unknown;
    Failed?: unknown;
  };
  registerTaskAsync?: (
    name: string,
    options: { minimumInterval: number; stopOnTerminate?: boolean; startOnBoot?: boolean },
  ) => Promise<void>;
  unregisterTaskAsync?: (name: string) => Promise<void>;
  getStatusAsync?: () => Promise<number | null>;
};

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
  // Settings is hydrated here too so `isPremium` reads the persisted value
  // — otherwise the bg-task short-circuits below.
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
  // Subscription is the ENTRY gate (gatePremium at toggle-on time in
  // mood.tsx). Once a feature is on, the runtime loop must NOT gate on
  // isPremium — if the user lapses their subscription, an already-running
  // engine should keep running until they explicitly turn it off.
  if (moodState.sleepWakeEnabled && moodState.sleepWakePackId) {
    const swApplied = await runSleepWakeFallback();
    if (swApplied) return true;
  }

  // Honour the master gates set by the user. Same rationale as above —
  // no runtime isPremium check; that lives at the toggle-on UI in
  // app/(tabs)/mood.tsx via gatePremium().
  if (!moodState.backgroundEnabled) return false;
  if (!moodState.moodCollectionId) return false;

  // 1) Read background-friendly signals.
  const steps = await recentSteps(60);
  const ctx = inferContextMoodNow(steps);

  // 2) No same-mood dedupe. The earlier version short-circuited when the
  //    context mood matched `lastBgMood`, which meant a locked-screen user
  //    saw NO rotation for hours because the time-bucketed mood only
  //    changes every ~4 h (06/10/14/18/22/02 boundaries). Same UX bug the
  //    camera path already removed (see MoodEngineHost.tsx, lines 84-91).
  //    `pickPhotoForMood` already excludes `currentPhotoId`, so a
  //    same-mood tick rotates to a different photo in the same bucket
  //    instead of staying frozen. `lastBgMood` is still written below so
  //    the store stays consistent if other code starts reading it.

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

// ─── Sleep/Wake fallback ──────────────────────────────────────────────────
//
// If the user has Sleep/Wake mode on and the wake (or sleep) image hasn't
// been applied today, AND we're past the corresponding hour, apply it now.
// This catches users who ignore the wake/sleep notification — within the
// next bg tick (≈ 30 min on Android WorkManager), the wallpaper switches
// automatically without any tap.
//
// Returns true if any image was applied this pass.
async function runSleepWakeFallback(): Promise<boolean> {
  const s = useMoodStore.getState();
  if (!s.sleepWakeEnabled || !s.sleepWakePackId) return false;

  // Degenerate guard: if sleep hour == wake hour the two windows below
  // collapse (sleep window becomes empty, wake window becomes "always"),
  // which would fire wake every day and sleep never. There's no coherent
  // schedule to honour, so do nothing. The UI hour pickers also prevent
  // selecting equal hours; this is belt + braces for any persisted state.
  if (s.sleepWakeSleepHour === s.sleepWakeWakeHour) return false;

  const now = new Date();
  // LOCAL date — `toISOString()` is UTC and disagrees with `getHours()`
  // (local) in any non-UTC timezone, so the per-day stamp could mark
  // today's wake as belonging to tomorrow (or yesterday) and either
  // skip or re-fire incorrectly. The hour comparison below is local;
  // the day key must be too.
  const today = localDayKey(now);
  const hour = now.getHours();

  let appliedSomething = false;

  // SLEEP first — if it's late (≥ sleep hour) OR very early morning (<wake),
  // we're in the "should be sleeping" zone. Same-day stamp guards re-apply.
  const inSleepWindow =
    s.sleepWakeSleepHour <= s.sleepWakeWakeHour
      ? hour >= s.sleepWakeSleepHour && hour < s.sleepWakeWakeHour
      : hour >= s.sleepWakeSleepHour || hour < s.sleepWakeWakeHour;
  if (inSleepWindow && s.sleepWakeLastSleepDay !== today) {
    const r = await applySleepWakePhoto(s.sleepWakePackId, 'sleep');
    if (r.ok && r.photoId) {
      await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
      await useMoodStore.getState().setSleepWakeLastSleepDay(today);
      const next = await recordMood('calm', 'sleepwake', 1);
      useMoodStore.setState({
        currentMood: 'calm',
        lastSource: 'sleepwake',
        lastConfidence: 1,
        history: next,
      });
      appliedSomething = true;
      // One pass applies AT MOST one image. If we're in the sleep window
      // we're by definition NOT in the wake window (the two are mutually
      // exclusive once sleepHour != wakeHour), but return early anyway so a
      // future edit can never accidentally apply both sleep + wake in a
      // single tick and visibly "flip" the wallpaper twice.
      return true;
    }
  }

  // WAKE — if we're past wake hour AND not yet in sleep hour.
  const inWakeWindow =
    s.sleepWakeSleepHour <= s.sleepWakeWakeHour
      ? hour < s.sleepWakeSleepHour || hour >= s.sleepWakeWakeHour
      : hour >= s.sleepWakeWakeHour && hour < s.sleepWakeSleepHour;
  if (inWakeWindow && s.sleepWakeLastWakeDay !== today) {
    const r = await applySleepWakePhoto(s.sleepWakePackId, 'wake');
    if (r.ok && r.photoId) {
      await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
      await useMoodStore.getState().setSleepWakeLastWakeDay(today);
      const next = await recordMood('happy', 'sleepwake', 1);
      useMoodStore.setState({
        currentMood: 'happy',
        lastSource: 'sleepwake',
        lastConfidence: 1,
        history: next,
      });
      appliedSomething = true;
    }
  }

  return appliedSomething;
}

/** Local-time `YYYY-MM-DD` for the bg-task + notification day stamps. */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export { localDayKey };

// Define the task as soon as this module is first imported (which the
// bootstrap file does at app start, well before any React mounts). This
// is required for cold-launch background dispatches to find the handler.
ensureTaskDefined();
