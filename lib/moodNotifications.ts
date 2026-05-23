/**
 * Daily mood-prompt notification.
 *
 * Schedules a recurring local notification at the user's chosen hour.
 * The notification carries 5 action buttons (Happy/Sad/Angry/Calm/Excited)
 * so the user can apply a wallpaper with one tap without ever opening
 * the app. Action handling is registered globally via
 * `addNotificationResponseReceivedListener` and routes through the existing
 * `applyMoodPhotoFromCollection` + `setCurrentMoodPhoto` pipeline.
 *
 * Like the rest of the mood subsystem, every native call is lazy-required
 * + try/catched so the JS layer stays loadable even before
 * `expo-notifications` is linked.
 */

import {
  type MoodId,
  MANUAL_MOOD_IDS,
  MOOD_BY_ID,
  NOTIFICATION_MOOD_IDS,
} from '../constants/moods';
import { getSleepWakePack } from '../constants/sleepWakePacks';
import { useMoodStore } from '../store/mood';
import { localDayKey } from './moodBackgroundTask';
import {
  applyMoodPhotoFromCollection,
  applySleepWakePhoto,
} from './moodEngineActions';
import { recordMood } from './moodHistory';

type NotificationsLike = {
  setNotificationHandler?: (handler: unknown) => void;
  setNotificationCategoryAsync?: (
    name: string,
    actions: Array<{
      identifier: string;
      buttonTitle: string;
      options?: { opensAppToForeground?: boolean };
    }>,
  ) => Promise<unknown>;
  scheduleNotificationAsync?: (input: {
    identifier?: string;
    content: {
      title: string;
      body: string;
      categoryIdentifier?: string;
      data?: Record<string, unknown>;
    };
    trigger: unknown;
  }) => Promise<string>;
  cancelScheduledNotificationAsync?: (id: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
  /** Remove a NOW-DISPLAYED notification from the system shade. Does NOT
   *  affect future scheduled fires of the same identifier. */
  dismissNotificationAsync?: (identifier: string) => Promise<void>;
  getPermissionsAsync?: () => Promise<{
    granted?: boolean;
    status?: string;
    canAskAgain?: boolean;
  }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean; status?: string }>;
  addNotificationResponseReceivedListener?: (
    cb: (response: NotificationResponseLike) => void,
  ) => { remove: () => void };
  getLastNotificationResponseAsync?: () => Promise<NotificationResponseLike | null>;
  SchedulableTriggerInputTypes?: {
    DAILY?: unknown;
    CALENDAR?: unknown;
    TIME_INTERVAL?: unknown;
  };
  AndroidImportance?: { HIGH?: number; DEFAULT?: number };
};

type NotificationResponseLike = {
  actionIdentifier: string;
  notification: {
    request: {
      /** Identifier of the displayed notification — used to clear the
       *  banner from the system shade after we handle the action. */
      identifier?: string;
      content: { data?: Record<string, unknown> };
    };
  };
};

const CATEGORY = 'kawaii.mood.prompt';
const SW_CATEGORY = 'kawaii.mood.sleepwake';
const NOTIF_TAG = 'kawaii.mood.daily';
const FRIEND_NOTIF_TAG = 'kawaii.mood.friend';
const SW_WAKE_TAG = 'kawaii.mood.sleepwake.wake';
const SW_SLEEP_TAG = 'kawaii.mood.sleepwake.sleep';
/** Bag of friendly opener lines for the recurring check-in. Picked at random
 *  per fire so it feels less like a robot. */
const FRIEND_OPENERS: Array<{ title: string; body: string }> = [
  { title: 'Hey 👋 how are you feeling?', body: 'Tap a mood — I’ll change your wallpaper to match.' },
  { title: 'Quick mood check 💭', body: 'How’s the vibe right now?' },
  { title: 'Checking in 🫶', body: 'Pick a feeling — wallpaper updates instantly.' },
  { title: 'How’s it going? 😊', body: 'One tap below sets your wallpaper.' },
  { title: 'Mood check-in ✨', body: 'Tell me how you feel — I’ll handle the rest.' },
];

let mod: NotificationsLike | null = null;
let resolved = false;

function getMod(): NotificationsLike | null {
  if (resolved) return mod;
  resolved = true;
  try {

    mod = require('expo-notifications') as NotificationsLike;
  } catch {
    mod = null;
  }
  return mod;
}

// ─── permission ────────────────────────────────────────────────────────────

export async function ensureNotificationPermission(): Promise<boolean> {
  const m = getMod();
  if (!m?.getPermissionsAsync) return false;
  try {
    const cur = await m.getPermissionsAsync();
    if (cur?.granted) return true;
    if (!m.requestPermissionsAsync) return false;
    const next = await m.requestPermissionsAsync();
    return !!next?.granted;
  } catch {
    return false;
  }
}

// ─── category + handler — registered at MODULE LOAD ───────────────────────
// expo-notifications dispatches a cold-launched action response very soon
// after the JS bundle parses, before any React tree mounts and before the
// `_layout.tsx` bootstrap effect fires. Registering at module load is the
// only way to guarantee that the very first button-tap-from-killed-app is
// captured (audit B2).

let categoryRegistered = false;
let responseSub: { remove: () => void } | null = null;
const responseQueue: NotificationResponseLike[] = [];
let storesReady = false;

function maybeRegister() {
  const m = getMod();
  if (!m) return;

  if (m.setNotificationHandler) {
    try {
      m.setNotificationHandler({
        // Fires for EVERY notification presented while the JS bundle is
        // alive (typically: app in foreground; on Android also during a
        // brief background grace period before the OS suspends JS). For
        // Sleep/Wake fires we use this as an extra auto-apply path so the
        // wallpaper changes at wake/sleep hour without the user having to
        // tap the notification — closing the "I see the notification but
        // my wallpaper didn't change" gap when the app is open.
        //
        // The tap-driven path (handleResponse) still runs independently
        // for the cold-app case, and the bg-task fallback covers the
        // OS-suspended case. Three layers of redundancy is intentional.
        handleNotification: async (
          notification: NotificationResponseLike['notification'] | undefined,
        ) => {
          try {
            const data = notification?.request?.content?.data ?? {};
            const tag = (data as Record<string, unknown>).tag as
              | string
              | undefined;
            if (tag === SW_WAKE_TAG || tag === SW_SLEEP_TAG) {
              // Best-effort auto-apply — failures here are silent because
              // the tap fallback still works.
              void autoApplySleepWake(
                tag === SW_WAKE_TAG ? 'wake' : 'sleep',
                (data as Record<string, unknown>).packId as
                  | string
                  | undefined,
              );
            }
          } catch (e) {
            if (__DEV__) console.warn('[MoodNotif] handler inspect failed:', e);
          }
          return {
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        },
      });
    } catch { /* noop */ }
  }

  if (!categoryRegistered && m.setNotificationCategoryAsync) {
    // All 7 moods in the notification category. The OS shows the first
    // 2–3 collapsed and the rest after expand — Android limitation we
    // can't override. The on-screen Mood Home button row still uses the
    // 5-button `MANUAL_MOOD_IDS` because the cards are bigger there.
    const actions = NOTIFICATION_MOOD_IDS.map((id) => ({
      identifier: `mood.${id}`,
      buttonTitle: `${MOOD_BY_ID[id].emoji} ${MOOD_BY_ID[id].label}`,
      options: { opensAppToForeground: false },
    }));
    // Fire-and-forget; if this hasn't resolved by the time the user taps,
    // the OS still routes the tap to our process — we just may lose the
    // category buttons on iOS for the very first cycle. Acceptable.
    m.setNotificationCategoryAsync(CATEGORY, actions).then(
      () => { categoryRegistered = true; },
      (e) => { if (__DEV__) console.warn('[MoodNotif] category register failed:', e); },
    );
    // Sleep/Wake category — single "Apply" action that auto-changes the
    // wallpaper without opening the app. Tapping the notification body
    // itself ALSO triggers the same handler via the default actionIdentifier.
    m.setNotificationCategoryAsync(SW_CATEGORY, [
      {
        identifier: 'sleepwake.apply',
        buttonTitle: '✓ Apply wallpaper',
        options: { opensAppToForeground: false },
      },
    ]).catch((e) => {
      if (__DEV__) console.warn('[MoodNotif] sw category register failed:', e);
    });
  }

  if (!responseSub && m.addNotificationResponseReceivedListener) {
    responseSub = m.addNotificationResponseReceivedListener((r) => {
      if (storesReady) {
        handleResponse(r);
      } else {
        // Buffer until the bootstrap drains it.
        responseQueue.push(r);
      }
    });
  }
}

// SIDE EFFECT — registers everything as soon as this file is imported.
maybeRegister();

/**
 * Auto-apply the wake or sleep wallpaper without a user tap. Called from
 * the foreground notification handler (`setNotificationHandler`) the
 * instant the OS presents a SW notification while our JS bundle is alive.
 *
 * Mirrors the SW branch of `handleResponse` (apply + day-stamp + history
 * write) so the user sees the same end-state whether they tap or not.
 * Per-day stamps prevent the bg-fetch fallback from re-applying later in
 * the same wake/sleep window.
 */
async function autoApplySleepWake(
  kind: 'wake' | 'sleep',
  packId: string | undefined,
): Promise<void> {
  if (!packId) return;
  // Per-day idempotency gate. The OS can re-present / coalesce the same
  // foreground notification (e.g. on screen-on after a Doze window), and
  // this handler fires for EVERY presentation. Without checking the
  // day-stamp first, a re-present would re-apply the wallpaper AND write a
  // duplicate `sleepwake` history entry (not covered by the camera-only
  // dedup). Bail if we already applied this kind today. Audit MOOD-5.
  const today = localDayKey(new Date());
  const sw = useMoodStore.getState();
  const lastDay =
    kind === 'wake' ? sw.sleepWakeLastWakeDay : sw.sleepWakeLastSleepDay;
  if (lastDay === today) return;
  try {
    const r = await applySleepWakePhoto(packId, kind);
    if (!r.ok || !r.photoId) return;
    await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
    if (kind === 'wake') {
      await useMoodStore.getState().setSleepWakeLastWakeDay(today);
    } else {
      await useMoodStore.getState().setSleepWakeLastSleepDay(today);
    }
    const moodForHistory: MoodId = kind === 'wake' ? 'happy' : 'calm';
    const nextHistory = await recordMood(moodForHistory, 'sleepwake', 1);
    useMoodStore.setState({
      currentMood: moodForHistory,
      lastSource: 'sleepwake',
      lastConfidence: 1,
      history: nextHistory,
    });
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] auto-apply sw failed:', e);
  }
}

/**
 * Called by `moodBootstrap` once the mood + shuffle stores have hydrated.
 * Drains any responses that arrived during module-load (incl. cold-launch
 * action taps) AND queries `getLastNotificationResponseAsync` so a tap that
 * arrived before our listener was attached is also handled.
 */
export async function flushPendingNotificationResponse(): Promise<void> {
  storesReady = true;
  while (responseQueue.length > 0) {
    const r = responseQueue.shift();
    if (r) await handleResponse(r);
  }
  const m = getMod();
  if (m?.getLastNotificationResponseAsync) {
    try {
      const last = await m.getLastNotificationResponseAsync();
      if (last) await handleResponse(last);
    } catch { /* noop */ }
  }
}

/** Kept for back-compat with bootstrap; now a no-op since registration
 *  happens at module load. */
export async function bootstrapNotifications(): Promise<void> {
  maybeRegister();
}

async function handleResponse(response: NotificationResponseLike) {
  const id = response?.actionIdentifier ?? '';
  const data = response?.notification?.request?.content?.data ?? {};
  const tag = (data as Record<string, unknown>).tag as string | undefined;
  const displayedId = response?.notification?.request?.identifier;

  // Wrap up the user's flow: pull the notification off the shade once we've
  // done our work. Friend-like UX — "ask once, vanish when answered."
  // Best-effort: if the native API isn't available or the identifier is
  // missing, silently skip — the user can swipe it away manually.
  const dismissNow = async () => {
    const m = getMod();
    if (!m?.dismissNotificationAsync || !displayedId) return;
    try {
      await m.dismissNotificationAsync(displayedId);
    } catch { /* noop */ }
  };

  // Sleep/Wake — tag identifies which image to apply; the default action
  // (tapping the notification body) and the explicit 'sleepwake.apply'
  // button both trigger the same logic.
  if (tag === SW_WAKE_TAG || tag === SW_SLEEP_TAG) {
    const kind: 'wake' | 'sleep' = tag === SW_WAKE_TAG ? 'wake' : 'sleep';
    const packId = (data as Record<string, unknown>).packId as string | undefined;
    if (!packId) return;
    const r = await applySleepWakePhoto(packId, kind);
    if (r.ok && r.photoId) {
      await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
      // Stamp today (LOCAL date — see localDayKey in moodBackgroundTask.ts)
      // so the bg-task fallback doesn't re-apply.
      const today = localDayKey(new Date());
      if (kind === 'wake') {
        await useMoodStore.getState().setSleepWakeLastWakeDay(today);
      } else {
        await useMoodStore.getState().setSleepWakeLastSleepDay(today);
      }
      // Use 'sleepwake' source so history reads "Sleep/Wake".
      const moodForHistory: MoodId = kind === 'wake' ? 'happy' : 'calm';
      const nextHistory = await recordMood(moodForHistory, 'sleepwake', 1);
      useMoodStore.setState({
        currentMood: moodForHistory,
        lastSource: 'sleepwake',
        lastConfidence: 1,
        history: nextHistory,
      });
    }
    await dismissNow();
    return;
  }

  // Daily / Friend mood prompts — actionIdentifier carries `mood.${moodId}`.
  if (!id.startsWith('mood.')) return;
  const mood = id.slice(5) as MoodId;
  if (!MOOD_BY_ID[mood]) return;

  // Ensure the shuffle pool is loaded before we try to pick a photo from it.
  try {

    const { hydrateShuffleStore } = require('../store/shuffle');
    await hydrateShuffleStore();
  } catch {
    /* shuffle store unavailable — fall through, apply will fail gracefully */
  }

  const state = useMoodStore.getState();
  if (!state.moodCollectionId) return;

  const r = await applyMoodPhotoFromCollection(
    mood,
    state.moodCollectionId,
    state.currentPhotoId,
  );
  if (r.ok && r.photoId) {
    await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
    // recordMood persists AND returns the new history array. The previous
    // version ignored that return value, so even though the entry was
    // written to AsyncStorage, the in-memory store's `history` field stayed
    // stale — the Mood Home "history" badge and any rendered list didn't
    // see the new entry until the next app cold launch. Push the returned
    // list into the store so live UI re-renders immediately.
    const nextHistory = await recordMood(mood, 'notification', 1);
    useMoodStore.setState({
      currentMood: mood,
      lastSource: 'notification',
      lastConfidence: 1,
      history: nextHistory,
    });
    await dismissNow();
  }

  // After ANY friend-tagged tap (the sub-15-min chain consumes one slot
  // per fire), re-batch so the cadence doesn't decay over time. No-op
  // for the ≥15-min repeating path and for daily notifications.
  if (tag === FRIEND_NOTIF_TAG) {
    void maybeRefillFriendChain();
  }
}

// ─── scheduling ────────────────────────────────────────────────────────────

export async function scheduleDailyMoodNotification(hour: number): Promise<boolean> {
  const m = getMod();
  if (!m?.scheduleNotificationAsync || !m?.cancelAllScheduledNotificationsAsync) {
    return false;
  }
  await bootstrapNotifications();

  // SDK 55 requires the enum discriminator on the trigger. Bail (and surface
  // a dev warning) if the host SDK doesn't ship it — silently falling back
  // would just throw at scheduleAsync.
  const triggerType = m.SchedulableTriggerInputTypes?.DAILY;
  if (triggerType === undefined) {
    if (__DEV__) console.warn('[MoodNotif] SchedulableTriggerInputTypes.DAILY missing — needs expo-notifications ≥ 0.27');
    return false;
  }

  try {
    await cancelMoodNotification();
    const id = await m.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: {
        title: 'How are you feeling? 😊',
        body: 'Tap a mood to update your wallpaper.',
        categoryIdentifier: CATEGORY,
        data: { tag: NOTIF_TAG },
      },
      trigger: {
        type: triggerType,
        hour,
        minute: 0,
      },
    });
    scheduledDailyId = id ?? DAILY_ID;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] schedule failed:', e);
    return false;
  }
}

// ─── per-id cancellation ──────────────────────────────────────────────────
// We track our two scheduled notifications by stable identifiers so we can
// cancel one without nuking the other. Older code used
// `cancelAllScheduledNotificationsAsync` which made daily + friend mutually
// exclusive — toggling either off killed both.

const DAILY_ID = 'kawaii.mood.daily.v1';
const FRIEND_ID = 'kawaii.mood.friend.v1';
const SW_WAKE_ID = 'kawaii.mood.sw.wake.v1';
const SW_SLEEP_ID = 'kawaii.mood.sw.sleep.v1';
/** Stable id for the immediate "how are you feeling?" prompt fired by the
 *  friend-checkin foreground-service tick (lib/moodBootstrap.ts) and the
 *  app-usage monitor. Reused on every fire so a NEW prompt REPLACES the
 *  previous one in the system shade instead of stacking — without it each
 *  tick posted a unique-id notification and they piled up, one per interval. */
const MOOD_PROMPT_NOW_ID = 'kawaii.mood.prompt.now.v1';
/** Prefix for the batch of one-shot fires used when interval < 15 min.
 *  Android's WorkManager periodic floor is 15 min, so a `repeats: true`
 *  trigger at 1–14 min is silently rounded up by the OS. To get true
 *  sub-15-min cadence we schedule a CHAIN of one-shot fires (each at
 *  intervalSec*n) up to FRIEND_BATCH_COUNT ahead. The chain is rebuilt
 *  every time the app opens (bootstrap) and after each user tap on a
 *  fired friend notification (response handler), so the user never runs
 *  out as long as they interact with the app at least once per batch
 *  window. iOS caps total scheduled notifications at 64 — 30 ≈ half of
 *  that budget, safe with the daily + sleep/wake slots. */
const FRIEND_CHAIN_PREFIX = 'kawaii.mood.friend.chain.';
const FRIEND_BATCH_COUNT = 30;
let scheduledDailyId: string | null = null;
let scheduledFriendId: string | null = null;
let scheduledSwWakeId: string | null = null;
let scheduledSwSleepId: string | null = null;
/** Chain identifiers currently scheduled (sub-15-min path) so we can
 *  cancel them individually before re-batching. */
let scheduledFriendChainIds: string[] = [];

async function cancelById(id: string | null): Promise<void> {
  if (!id) return;
  const m = getMod();
  if (!m?.cancelScheduledNotificationAsync) return;
  try {
    await m.cancelScheduledNotificationAsync(id);
  } catch {
    /* either already cancelled or the OS forgot it after a reboot */
  }
}

export async function cancelMoodNotification(): Promise<void> {
  await cancelById(scheduledDailyId ?? DAILY_ID);
  scheduledDailyId = null;
}

// ─── Friend check-in (recurring N-minute prompt) ──────────────────────────
//
// Schedules a repeating local notification at the user's chosen interval.
// Same 5-emoji category as the daily prompt, so the same response listener
// turns a button tap into an `applyMoodPhotoFromCollection` call. Works
// even when the app is fully closed.

/** Allowed presets — the UI exposes these as quick options. Custom minute
 *  values (1 ≤ N ≤ 1440) are also accepted by `scheduleFriendCheckIn`.
 *  Android WorkManager's lower bound for repeating alarms is 15 min — values
 *  below that get silently rounded up by the OS. The UI surfaces this when
 *  the user enters < 15. */
export const FRIEND_CHECK_IN_PRESETS = [15, 30, 60, 120, 240, 360] as const;
/** Android's silent rounding floor — UI uses this to warn the user. */
export const FRIEND_CHECK_IN_ANDROID_FLOOR = 15;

const FRIEND_CHECK_IN_MIN = 1;        // user's lower bound (Android rounds up <15)
const FRIEND_CHECK_IN_MAX = 24 * 60;  // 24 h ceiling — beyond that, use daily

function clampCheckInMinutes(n: number): number {
  if (!Number.isFinite(n)) return 60;
  return Math.max(FRIEND_CHECK_IN_MIN, Math.min(FRIEND_CHECK_IN_MAX, Math.round(n)));
}

export async function scheduleFriendCheckInNotification(
  intervalMinutes: number,
): Promise<boolean> {
  const m = getMod();
  if (!m?.scheduleNotificationAsync) return false;
  await bootstrapNotifications();

  const triggerType = m.SchedulableTriggerInputTypes?.TIME_INTERVAL;
  if (triggerType === undefined) {
    if (__DEV__) console.warn('[MoodNotif] TIME_INTERVAL trigger missing — needs expo-notifications ≥ 0.27');
    return false;
  }

  const clampedMin = clampCheckInMinutes(intervalMinutes);
  const intervalSec = clampedMin * 60;

  try {
    // Always nuke BOTH paths before scheduling — covers the case where the
    // user toggled from 60 min (repeating) to 1 min (chained) or vice versa.
    await cancelFriendCheckInNotification();

    // ─── Sub-15-min path: batch of one-shot fires ─────────────────────
    // Android's WorkManager periodic floor is 15 min — a `repeats: true`
    // trigger at 1–14 min gets silently rounded up. To honour the user's
    // 1–14 min request we schedule a CHAIN of FRIEND_BATCH_COUNT one-shot
    // notifications at intervalSec*n. Each fire is independent so no
    // periodic floor applies. The chain is rebuilt on app open (bootstrap
    // re-calls this function when friendCheckInEnabled is true) and after
    // each tap (response handler calls maybeRefillFriendChain).
    if (clampedMin < FRIEND_CHECK_IN_ANDROID_FLOOR) {
      const chainIds: string[] = [];
      for (let i = 1; i <= FRIEND_BATCH_COUNT; i++) {
        const opener =
          FRIEND_OPENERS[Math.floor(Math.random() * FRIEND_OPENERS.length)];
        const ident = `${FRIEND_CHAIN_PREFIX}${i}`;
        try {
          await m.scheduleNotificationAsync({
            identifier: ident,
            content: {
              title: opener.title,
              body: opener.body,
              categoryIdentifier: CATEGORY,
              data: {
                tag: FRIEND_NOTIF_TAG,
                source: 'friend',
                chainIndex: i,
                intervalMinutes: clampedMin,
              },
            },
            trigger: {
              type: triggerType,
              seconds: intervalSec * i,
              repeats: false,
            },
          });
          chainIds.push(ident);
        } catch (e) {
          // iOS budget exhausted or other OS error — keep whatever we've
          // queued so far. The chain self-heals on the next tap.
          if (__DEV__) console.warn(`[MoodNotif] friend chain slot ${i} failed:`, e);
          break;
        }
      }
      scheduledFriendChainIds = chainIds;
      return chainIds.length > 0;
    }

    // ─── ≥15-min path: single repeating notification ──────────────────
    // Pick the opener at schedule time so repeated fires of THIS scheduled
    // notification show the same text. (expo-notifications doesn't support
    // per-fire content variation — you'd need to reschedule each time.)
    const opener = FRIEND_OPENERS[Math.floor(Math.random() * FRIEND_OPENERS.length)];
    const id = await m.scheduleNotificationAsync({
      identifier: FRIEND_ID,
      content: {
        title: opener.title,
        body: opener.body,
        categoryIdentifier: CATEGORY,
        data: { tag: FRIEND_NOTIF_TAG, source: 'friend' },
      },
      trigger: {
        type: triggerType,
        seconds: intervalSec,
        repeats: true,
      },
    });
    scheduledFriendId = id ?? FRIEND_ID;
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] friend check-in schedule failed:', e);
    return false;
  }
}

export async function cancelFriendCheckInNotification(): Promise<void> {
  // Cancel the periodic slot (≥15 min path)…
  await cancelById(scheduledFriendId ?? FRIEND_ID);
  scheduledFriendId = null;
  // …and every chain slot (<15 min path). Iterate both the tracked list
  // (warm path) and the deterministic prefix range (cold path: process
  // restarted, in-memory list lost but OS still holds the schedule).
  const toCancel = new Set<string>(scheduledFriendChainIds);
  for (let i = 1; i <= FRIEND_BATCH_COUNT; i++) {
    toCancel.add(`${FRIEND_CHAIN_PREFIX}${i}`);
  }
  for (const id of toCancel) {
    await cancelById(id);
  }
  scheduledFriendChainIds = [];
}

/**
 * Re-batch the sub-15-min friend chain. Called from the notification
 * response handler after the user taps any friend-tagged notification —
 * each tap consumes one slot from the chain, so re-batching keeps the
 * cadence going. Safe to call from the ≥15-min path too; it short-circuits
 * if the user isn't on a sub-15-min interval. Reads the current interval
 * from the mood store rather than taking it as an argument so the response
 * listener doesn't need to know about settings.
 */
export async function maybeRefillFriendChain(): Promise<void> {
  try {

    const { useMoodStore: ms } = require('../store/mood');
    const s = ms.getState();
    if (!s?.friendCheckInEnabled) return;
    const interval = clampCheckInMinutes(s.friendCheckInMinutes ?? 60);
    if (interval >= FRIEND_CHECK_IN_ANDROID_FLOOR) return;
    await scheduleFriendCheckInNotification(interval);
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] refill friend chain failed:', e);
  }
}

// ─── Sleep/Wake — 2 daily scheduled notifications ─────────────────────────

/**
 * Schedule the wake + sleep notifications for a Sleep/Wake pack.
 *
 * Each is a daily-at-hour trigger. The notification's `data.tag` +
 * `data.packId` are read by `handleResponse` to apply the matching
 * wallpaper. The user can tap the notification body OR the explicit
 * "Apply wallpaper" action button — both resolve through the same path.
 *
 * Returns the number of notifications successfully scheduled (0, 1, or 2).
 */
export async function scheduleSleepWakeNotifications(
  packId: string,
  packName: string,
  wakeHour: number,
  sleepHour: number,
): Promise<number> {
  const m = getMod();
  if (!m?.scheduleNotificationAsync) return 0;
  await bootstrapNotifications();

  const triggerType = m.SchedulableTriggerInputTypes?.DAILY;
  if (triggerType === undefined) {
    if (__DEV__) console.warn('[MoodNotif] DAILY trigger missing — needs expo-notifications ≥ 0.27');
    return 0;
  }

  await cancelSleepWakeNotifications();

  let scheduled = 0;
  try {
    const wakeIdRet = await m.scheduleNotificationAsync({
      identifier: SW_WAKE_ID,
      content: {
        title: '☀️ Good morning',
        body: `Tap to apply your ${packName} wake-up wallpaper.`,
        categoryIdentifier: SW_CATEGORY,
        data: { tag: SW_WAKE_TAG, packId },
      },
      trigger: { type: triggerType, hour: wakeHour, minute: 0 },
    });
    scheduledSwWakeId = wakeIdRet ?? SW_WAKE_ID;
    scheduled++;
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] sw wake schedule failed:', e);
  }

  try {
    const sleepIdRet = await m.scheduleNotificationAsync({
      identifier: SW_SLEEP_ID,
      content: {
        title: '🌙 Sleep well',
        body: `Tap to apply your ${packName} cosy night wallpaper.`,
        categoryIdentifier: SW_CATEGORY,
        data: { tag: SW_SLEEP_TAG, packId },
      },
      trigger: { type: triggerType, hour: sleepHour, minute: 0 },
    });
    scheduledSwSleepId = sleepIdRet ?? SW_SLEEP_ID;
    scheduled++;
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] sw sleep schedule failed:', e);
  }

  return scheduled;
}

export async function cancelSleepWakeNotifications(): Promise<void> {
  await cancelById(scheduledSwWakeId ?? SW_WAKE_ID);
  await cancelById(scheduledSwSleepId ?? SW_SLEEP_ID);
  scheduledSwWakeId = null;
  scheduledSwSleepId = null;
}

/**
 * Fire a mood-prompt notification IMMEDIATELY (trigger: null).
 *
 * Used by Tier 2's app-usage monitor: "the user just opened Instagram —
 * fire the 5-emoji prompt now." Same category + same response listener as
 * the daily prompt, so a tap on any of the 5 buttons routes through
 * `handleResponse` and applies a wallpaper without opening the app.
 *
 * Returns true if the notification was dispatched, false if the native
 * module / permission / category isn't ready.
 */
export async function fireMoodPromptNotification(opts?: {
  title?: string;
  body?: string;
}): Promise<boolean> {
  const m = getMod();
  if (!m?.scheduleNotificationAsync) return false;

  // Re-check permission just in case the user revoked it between the toggle
  // turning on and now. Cheap call.
  const granted = await ensureNotificationPermission();
  if (!granted) return false;

  // Make sure the category + handler are registered (no-op if already done).
  maybeRegister();

  try {
    await m.scheduleNotificationAsync({
      // Reuse one stable id so each new prompt REPLACES the previous one in
      // the shade instead of stacking (the recurring tick fired this with a
      // fresh auto-id every time, which is what piled up).
      identifier: MOOD_PROMPT_NOW_ID,
      content: {
        title: opts?.title ?? 'Quick mood check 😊',
        body: opts?.body ?? 'Tap a feeling to update your wallpaper.',
        categoryIdentifier: CATEGORY,
        data: { tag: NOTIF_TAG, source: 'usage-monitor' },
      },
      // trigger: null → fire immediately
      trigger: null,
    });
    return true;
  } catch (e) {
    if (__DEV__) console.warn('[MoodNotif] fire-now failed:', e);
    return false;
  }
}
