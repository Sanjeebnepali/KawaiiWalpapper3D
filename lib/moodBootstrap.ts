/**
 * Mood-feature bootstrap — call exactly once at app start.
 *
 * Loads the background task definition (top-level side effect of importing
 * `lib/moodBackgroundTask.ts`) and wires the notification action listener.
 *
 * Imported by `app/_layout.tsx`. Idempotent.
 */

import {
  addContextMoodTickListener,
  isContextMoodForegroundAvailable,
  startContextMoodForeground,
  stopContextMoodForeground,
} from '../modules/context-mood-foreground';
import {
  addFriendCheckinTickListener,
  isFriendCheckinForegroundAvailable,
  startFriendCheckinForeground,
  stopFriendCheckinForeground,
} from '../modules/friend-checkin-foreground';
import { hydrateMoodStore, useMoodStore } from '../store/mood';
import { hydrateSettingsStore } from '../store/settings';
import { hydrateShuffleStore, useShuffleStore } from '../store/shuffle';
import {
  enforceSingleDriver,
  getActiveDrivers,
  isExclusivitySuppressed,
  resolveDriverToKeep,
} from './automationMode';
import { maybePromptBackgroundAccess } from './backgroundAccess';
import {
  registerMoodBackgroundTask,
  runMoodBackgroundOnce,
  unregisterMoodBackgroundTask,
} from './moodBackgroundTask';
import {
  precacheCollection,
  startForegroundShuffleForCollection,
  stopForegroundShuffle,
} from './shuffleActions';
import {
  CUSTOM_SLEEP_WAKE_ID,
  getSleepWakePack,
} from '../constants/sleepWakePacks';
import {
  cancelFriendCheckInNotification,
  cancelMoodNotification,
  cancelSleepWakeNotifications,
  ensureNotificationPermission,
  fireMoodPromptNotification,
  flushPendingNotificationResponse,
  scheduleDailyMoodNotification,
  scheduleFriendCheckInNotification,
  scheduleSleepWakeNotifications,
} from './moodNotifications';
import {
  startSleepWakeForegroundFromStore,
  stopSleepWakeForeground,
} from './sleepWakeForeground';

/** Auto-detect cadence the FGS uses. Matches the "every ~30 min" UI
 *  copy in `app/(tabs)/mood.tsx`. Kept here as a single source of
 *  truth so a future setting can route through one constant. */
const CONTEXT_MOOD_FGS_INTERVAL_MIN = 30;

let booted = false;

export async function bootstrapMoodFeature(): Promise<void> {
  if (booted) return;
  booted = true;

  // 1) Hydrate ALL THREE stores before any handler can fire. The background
  //    task + notification action handler reach into `useShuffleStore.
  //    collections` via `applyMoodPhotoFromCollection`; without that, a
  //    cold-launched dispatch sees `collections: []` and silently no-ops
  //    (audit B1). The settings store carries `isPremium`, which the
  //    bg-task gates the Sleep/Wake + context-mood fallback on — if it's
  //    still on its default (false) when the task runs, the silent
  //    auto-apply never fires even though `sleepWakeEnabled` is true.
  await Promise.all([
    hydrateMoodStore(),
    hydrateShuffleStore(),
    hydrateSettingsStore(),
  ]);

  // 1a) Normalize legacy state to the single-driver rule. Builds from
  //     before the coordinator (lib/automationMode.ts) could persist
  //     several continuous drivers as active at once — e.g. an active
  //     shuffle AND Mood-based AND Friend check-in. Restarting all of
  //     them below would recreate the exact "they all run at once" bug.
  //     We keep the highest-priority one (DRIVERS order: theme > mood >
  //     friend) and turn the rest off, BEFORE step 3 reads the flags to
  //     decide which services to start. This runs before the subscribers
  //     are registered (step 4), so it only corrects the flags — there's
  //     nothing started yet to tear down. Sleep/Wake + daily reminder are
  //     layers and are untouched.
  //
  //     Keep the user's MOST-RECENTLY-enabled driver (persisted marker),
  //     not the fixed DRIVERS-order winner — otherwise enabling Mood while
  //     an old theme shuffle was still persisted active would silently turn
  //     Mood back off in favour of the stale theme (audit MOOD-4).
  const activeDrivers = getActiveDrivers();
  if (activeDrivers.length > 1) {
    await enforceSingleDriver(resolveDriverToKeep(activeDrivers));
  }

  // 2) The notification handler + category were registered at MODULE LOAD
  //    (`moodNotifications.ts` top-level side-effect), so a cold-launched
  //    button tap that arrives before this effect runs is still handled.
  //    Here we just drain any response that was queued *before* the React
  //    tree mounted — see `flushPendingNotificationResponse`.
  await flushPendingNotificationResponse();

  // 2a) Install once-per-process tick listeners for the two new mood
  //     foreground services. The native FGSes (Android-only) emit an
  //     `onTick` event every N minutes on their own Handler — bypassing
  //     the AlarmManager / WorkManager throttling that makes
  //     `expo-notifications` / `expo-background-fetch` fire only in
  //     bursts when the user unlocks the phone. Each tick reuses an
  //     existing JS path:
  //       - friend tick   → fireMoodPromptNotification()   (same 7-emoji
  //         category + same tap-handling as the usage-monitor source)
  //       - context tick  → runMoodBackgroundOnce()        (existing
  //         context-inference + silent wallpaper apply + shuffle +
  //         sleep/wake fallback, all gated by their own store flags)
  //     Listeners survive Activity destruction because they're held by
  //     this bootstrap singleton, not a React component tree.
  addFriendCheckinTickListener(() => {
    // Gate inside the listener — between when the service first armed
    // its Handler and when this tick fired, the user may have disabled
    // friend check-in. We don't want a stale tick to leak a prompt.
    if (!useMoodStore.getState().friendCheckInEnabled) return;
    void fireMoodPromptNotification({
      title: 'Hey 👋 how are you feeling?',
      body: 'Tap a mood — I’ll change your wallpaper to match.',
    });
  });
  addContextMoodTickListener(() => {
    // Same gate rationale as above. The bg-task itself also gates on
    // `backgroundEnabled` inside runMoodBackgroundOnce, so this is
    // belt + braces.
    if (!useMoodStore.getState().backgroundEnabled) return;
    void runMoodBackgroundOnce();
  });

  // 3) Sync OS-level subscriptions with persisted gates.
  const s = useMoodStore.getState();
  // Register the OS background task when ANY of these are on:
  //   - mood context background (Tier 4)
  //   - sleep/wake silent fallback
  //   - an active theme-pack shuffle (the shuffle bg path piggybacks on
  //     the same OS dispatch — see runShuffleBackgroundOnce + the
  //     shuffleApplied branch at the top of runMoodBackgroundOnce)
  // Without this, a free user with only a shuffle on would never get an
  // OS dispatch and the wallpaper would only rotate while the app is
  // foreground.
  const activeShuffleId = useShuffleStore.getState().activeCollectionId;
  const shuffleNeedsBg = activeShuffleId != null;
  if (s.backgroundEnabled || s.sleepWakeEnabled || shuffleNeedsBg) {
    await registerMoodBackgroundTask();
  }
  // ALSO start the Android foreground service so the rotation survives
  // OEM background killers (Vivo / MIUI / ColorOS) which silently drop
  // WorkManager periodic work. The service runs natively with a low-
  // priority ongoing notification — the OS-sanctioned contract for
  // continuous user-requested work. No-op on iOS / dev sessions
  // without the native module linked.
  if (activeShuffleId) {
    const active = useShuffleStore
      .getState()
      .collections.find((c) => c.id === activeShuffleId);
    if (active && active.photoIds.length > 0) {
      // Fire-and-forget — precache + start runs in parallel with the
      // rest of bootstrap so we don't block app launch.
      void startForegroundShuffleForCollection(active);
    }
  }
  if (s.notifEnabled) {
    const granted = await ensureNotificationPermission();
    if (granted) {
      await scheduleDailyMoodNotification(s.notifHour);
    }
  }
  if (s.friendCheckInEnabled) {
    const granted = await ensureNotificationPermission();
    if (granted) {
      if (isFriendCheckinForegroundAvailable) {
        // Android with the native FGS linked — start the reliable timer.
        // Skip the expo-notifications schedule path entirely; if both
        // ran, the user would see TWO notifications per tick (the FGS
        // posts one via fireMoodPromptNotification + the OS would post
        // the scheduled one). See changes/060-*.md for the
        // AlarmManager/Doze coalescing background.
        startFriendCheckinForeground({
          intervalMinutes: s.friendCheckInMinutes,
        });
        // Nuke any expo-notifications schedule left over from a prior
        // bundle version (pre-this-change) so the FGS doesn't end up
        // duplicating fires with a stale repeating notification.
        await cancelFriendCheckInNotification();
      } else {
        // iOS / dev session before native rebuild — fall back to the
        // expo-notifications schedule. Apple's local notification
        // scheduler isn't subject to the Android Doze problem, so the
        // fallback is actually correct on iOS, not just a workaround.
        await scheduleFriendCheckInNotification(s.friendCheckInMinutes);
      }
    }
  }
  // Context-mood foreground service — same rationale as friend, but
  // ticks at CONTEXT_MOOD_FGS_INTERVAL_MIN min (default 30) so the
  // JS-side runMoodBackgroundOnce() can actually run while the app is
  // closed. We keep the expo-background-fetch registration above (line
  // ~95) as belt + braces — it's the iOS path AND it covers the rare
  // case where the FGS gets killed by an aggressive OEM (the bg-fetch
  // path eventually catches up via its own dedup checks).
  if (s.backgroundEnabled && isContextMoodForegroundAvailable) {
    startContextMoodForeground({
      intervalMinutes: CONTEXT_MOOD_FGS_INTERVAL_MIN,
    });
    // Warm the cache for the active Mood Collection so the very first
    // FGS tick on a locked screen has local file:// URIs to apply,
    // even if Wi-Fi was suspended overnight. Fire-and-forget — the
    // bg-tick path itself still does a cache-hit check inside
    // downloadToCache, so a slow precache doesn't block the first apply.
    void precacheMoodCollection();
  }
  if (s.sleepWakeEnabled && s.sleepWakePackId) {
    const isCustom = s.sleepWakePackId === CUSTOM_SLEEP_WAKE_ID;
    const pack = getSleepWakePack(s.sleepWakePackId);
    if (pack || (isCustom && s.sleepWakeCustomWakeId && s.sleepWakeCustomSleepId)) {
      const granted = await ensureNotificationPermission();
      if (granted) {
        await scheduleSleepWakeNotifications(
          isCustom ? CUSTOM_SLEEP_WAKE_ID : pack!.id,
          isCustom ? 'Your custom pair' : pack!.name,
          s.sleepWakeWakeHour,
          s.sleepWakeSleepHour,
        );
      }
      // Native foreground service — the only path that survives Vivo /
      // MIUI / ColorOS background killers WHILE the app is fully closed.
      // Notification + bg-fetch fallback above still run; this layer is
      // additive. Fire-and-forget so we don't block app launch on the
      // remote-image precache step.
      void startSleepWakeForegroundFromStore();
    }
  }

  // 3b) If a background feature is ALREADY active at launch (restored from
  //     a previous session) but the app isn't battery-whitelisted, the
  //     on-enable prompt never fired — so nudge the user to the battery
  //     setting now. Without the exemption, Doze defers our exact alarms
  //     and the features feel "stopped after counting." No-op if already
  //     whitelisted or on iOS.
  if (
    s.backgroundEnabled ||
    s.friendCheckInEnabled ||
    s.sleepWakeEnabled ||
    activeShuffleId != null
  ) {
    maybePromptBackgroundAccess();
  }

  // 4) Watch for live toggles so OS-level state stays in sync without the
  //    caller having to remember to register/unregister manually.
  useMoodStore.subscribe((state, prev) => {
    // Mutual exclusivity — Mood-based and Friend check-in are both
    // continuous drivers. Turning either ON stops every OTHER driver
    // (Theme shuffle + the sibling mood driver) so only the explicitly
    // chosen feature runs. Sleep/Wake + the daily reminder are layers
    // and are intentionally NOT swept up here. The single rule lives in
    // `lib/automationMode.ts`; this subscriber is just one trigger of it.
    // Guard against the coordinator's own teardown writes (it flips these
    // same flags) to avoid an A-stops-B-stops-A loop.
    if (!isExclusivitySuppressed()) {
      if (state.backgroundEnabled && !prev.backgroundEnabled) {
        void enforceSingleDriver('mood');
      }
      if (state.friendCheckInEnabled && !prev.friendCheckInEnabled) {
        void enforceSingleDriver('friend');
      }
    }

    // First time ANY background feature is enabled, offer the one-tap
    // battery/autostart setup so it actually keeps running when closed.
    // Self-gates to once-ever via a persisted flag.
    if (
      (state.backgroundEnabled && !prev.backgroundEnabled) ||
      (state.friendCheckInEnabled && !prev.friendCheckInEnabled) ||
      (state.sleepWakeEnabled && !prev.sleepWakeEnabled)
    ) {
      maybePromptBackgroundAccess();
    }

    // Re-evaluate against ALL three drivers (mood-bg, sleep/wake, active
    // shuffle) so toggling any of them off doesn't accidentally tear down
    // the OS dispatch the other two rely on.
    const anyNeedsBg =
      state.backgroundEnabled ||
      state.sleepWakeEnabled ||
      useShuffleStore.getState().activeCollectionId != null;
    if (
      state.backgroundEnabled !== prev.backgroundEnabled ||
      state.sleepWakeEnabled !== prev.sleepWakeEnabled
    ) {
      if (anyNeedsBg) registerMoodBackgroundTask();
      else unregisterMoodBackgroundTask();
    }

    // Context-mood foreground service — start/stop alongside the
    // bg-fetch above. On Android the FGS is the primary driver; the
    // bg-fetch is fallback for FGS death + iOS. No-op when the native
    // module isn't linked.
    if (state.backgroundEnabled !== prev.backgroundEnabled) {
      if (state.backgroundEnabled && isContextMoodForegroundAvailable) {
        startContextMoodForeground({
          intervalMinutes: CONTEXT_MOOD_FGS_INTERVAL_MIN,
        });
        // Same precache rationale as bootstrap step 3 — without this,
        // a user who toggles Mood Based on, immediately locks the
        // phone, and walks away gets the first apply only after the
        // network wakes up again. Pre-warming the cache eliminates
        // that gap.
        void precacheMoodCollection();
      } else if (!state.backgroundEnabled && isContextMoodForegroundAvailable) {
        stopContextMoodForeground();
      }
    }
    // Also precache when the user swaps the active Mood Collection
    // while Mood Based is already on — otherwise the new collection's
    // photos would only land in cache lazily through the apply path.
    if (
      state.backgroundEnabled &&
      state.moodCollectionId !== prev.moodCollectionId &&
      state.moodCollectionId != null
    ) {
      void precacheMoodCollection();
    }

    if (
      state.notifEnabled !== prev.notifEnabled ||
      state.notifHour !== prev.notifHour
    ) {
      if (state.notifEnabled) {
        ensureNotificationPermission().then((g) => {
          if (g) scheduleDailyMoodNotification(state.notifHour);
        });
      } else {
        cancelMoodNotification();
      }
    }

    if (
      state.friendCheckInEnabled !== prev.friendCheckInEnabled ||
      state.friendCheckInMinutes !== prev.friendCheckInMinutes
    ) {
      if (state.friendCheckInEnabled) {
        ensureNotificationPermission().then((g) => {
          if (!g) return;
          if (isFriendCheckinForegroundAvailable) {
            // Restart the FGS — the service's ACTION_START handler
            // re-arms the Handler with the new interval, so this both
            // covers "toggle just flipped on" and "interval changed
            // while on" cleanly.
            startFriendCheckinForeground({
              intervalMinutes: state.friendCheckInMinutes,
            });
            // Belt: nuke any expo-notifications schedule that the
            // previous bundle version may have left in the OS so we
            // don't end up double-notifying after upgrade.
            cancelFriendCheckInNotification();
          } else {
            // iOS / pre-rebuild — same fallback rationale as bootstrap.
            scheduleFriendCheckInNotification(state.friendCheckInMinutes);
          }
        });
      } else {
        if (isFriendCheckinForegroundAvailable) {
          stopFriendCheckinForeground();
        }
        // Always also nuke the expo-notifications schedule, in case the
        // user toggled off after an FGS-less session left one queued.
        cancelFriendCheckInNotification();
      }
    }

    // Sleep/Wake — re-schedule whenever any of (enabled, pack, wake hour,
    // sleep hour) changes. Cancel when toggled off.
    const swInputsChanged =
      state.sleepWakeEnabled !== prev.sleepWakeEnabled ||
      state.sleepWakePackId !== prev.sleepWakePackId ||
      state.sleepWakeWakeHour !== prev.sleepWakeWakeHour ||
      state.sleepWakeSleepHour !== prev.sleepWakeSleepHour ||
      state.sleepWakeCustomWakeId !== prev.sleepWakeCustomWakeId ||
      state.sleepWakeCustomSleepId !== prev.sleepWakeCustomSleepId;
    if (swInputsChanged) {
      if (state.sleepWakeEnabled && state.sleepWakePackId) {
        const isCustom = state.sleepWakePackId === CUSTOM_SLEEP_WAKE_ID;
        const pack = getSleepWakePack(state.sleepWakePackId);
        if (pack || (isCustom && state.sleepWakeCustomWakeId && state.sleepWakeCustomSleepId)) {
          ensureNotificationPermission().then((g) => {
            if (g) {
              scheduleSleepWakeNotifications(
                isCustom ? CUSTOM_SLEEP_WAKE_ID : pack!.id,
                isCustom ? 'Your custom pair' : pack!.name,
                state.sleepWakeWakeHour,
                state.sleepWakeSleepHour,
              );
            }
          });
          // Restart the native FGS with the new params (pack swap, hour
          // change, or custom-pair pick) so the next fire honours the
          // edit instead of using the previous params.
          void startSleepWakeForegroundFromStore();
        } else {
          // Pack id is 'custom' but user hasn't picked both photos yet —
          // cancel any prior schedule so we don't fire empty notifications.
          cancelSleepWakeNotifications();
          stopSleepWakeForeground();
        }
      } else {
        cancelSleepWakeNotifications();
        stopSleepWakeForeground();
      }
    }
  });

  // Shuffle-store subscriber — register the OS bg task when the user
  // first activates a collection (so the wallpaper rotates while the app
  // is closed), unregister when they deactivate AND no mood feature
  // needs the dispatch either.
  useShuffleStore.subscribe((state, prev) => {
    if (state.activeCollectionId === prev.activeCollectionId) return;

    // Mutual exclusivity — activating a shuffle (Theme driver) stops the
    // other continuous drivers (Mood-based + Friend check-in) so they
    // don't fight over the wallpaper. Sleep/Wake is intentionally NOT
    // disabled — it's a time-of-day layer, not a continuous driver, so
    // it coexists with whichever driver is active. The rule lives in
    // `lib/automationMode.ts`.
    if (
      !isExclusivitySuppressed() &&
      state.activeCollectionId != null &&
      prev.activeCollectionId == null
    ) {
      void enforceSingleDriver('theme');
      // First-time background-access nudge (same one-time gate as the
      // mood subscriber).
      maybePromptBackgroundAccess();
    }

    // Foreground-service lifecycle for the native shuffle rotator.
    // Activating a shuffle → start the FGS so rotations survive app
    // close + OEM background killers. Deactivating → stop it. Property
    // edits on the active collection (timer / mode / photo list) →
    // restart the FGS so it picks up the new params.
    const activeChanged =
      state.activeCollectionId !== prev.activeCollectionId;
    if (activeChanged) {
      if (state.activeCollectionId == null) {
        stopForegroundShuffle();
      } else {
        const active = state.collections.find(
          (c) => c.id === state.activeCollectionId,
        );
        if (active && active.photoIds.length > 0) {
          void startForegroundShuffleForCollection(active);
        }
      }
    } else if (state.activeCollectionId != null) {
      const prevActive = prev.collections.find(
        (c) => c.id === state.activeCollectionId,
      );
      const nextActive = state.collections.find(
        (c) => c.id === state.activeCollectionId,
      );
      const propsChanged =
        prevActive != null &&
        nextActive != null &&
        (prevActive.timerId !== nextActive.timerId ||
          prevActive.customMinutes !== nextActive.customMinutes ||
          prevActive.mode !== nextActive.mode ||
          prevActive.photoIds.length !== nextActive.photoIds.length ||
          prevActive.photoIds.some((id, i) => id !== nextActive.photoIds[i]));
      if (propsChanged && nextActive && nextActive.photoIds.length > 0) {
        void startForegroundShuffleForCollection(nextActive);
      }
    }

    const m = useMoodStore.getState();
    const anyNeedsBg =
      m.backgroundEnabled ||
      m.sleepWakeEnabled ||
      state.activeCollectionId != null;
    if (anyNeedsBg) registerMoodBackgroundTask();
    else unregisterMoodBackgroundTask();
  });
}

/**
 * Pre-download every photo in the active Mood Collection so the FGS tick
 * path (`runMoodBackgroundOnce` → `applyMoodPhotoFromCollection` →
 * `setAsWallpaper` → `downloadToCache`) finds a local file:// URI and
 * skips the network round-trip entirely. Pairs with the cache-hit
 * short-circuit added to `downloadToCache` itself.
 *
 * Reuses the shuffle-side `precacheCollection` helper (same shape — it
 * resolves catalog ids + http URLs to local cache paths, drops failures
 * silently). Returns early when no collection is set so the helper is
 * cheap to call from any toggle handler without checking state first.
 */
async function precacheMoodCollection(): Promise<void> {
  const m = useMoodStore.getState();
  if (!m.moodCollectionId) return;
  const shuffle = useShuffleStore.getState();
  const collection = shuffle.collections.find(
    (c) => c.id === m.moodCollectionId,
  );
  if (!collection || collection.photoIds.length === 0) return;
  try {
    await precacheCollection(collection.photoIds);
  } catch (e) {
    if (__DEV__) console.warn('[moodBootstrap] precache failed:', e);
  }
}
