/**
 * Pure constants + stateless helpers for the mood-notification subsystem.
 *
 * Extracted verbatim from `moodNotifications.ts` to keep that file under the
 * size cap. Everything here is a plain string / number / array literal or a
 * pure function that reads NO module-level mutable state and calls NO native
 * module — so moving it is behavior-neutral. Public (exported) symbols are
 * re-exported from `moodNotifications.ts` so importers are unchanged.
 */

export const CATEGORY = 'kawaii.mood.prompt';
export const SW_CATEGORY = 'kawaii.mood.sleepwake';
export const NOTIF_TAG = 'kawaii.mood.daily';
export const FRIEND_NOTIF_TAG = 'kawaii.mood.friend';
export const SW_WAKE_TAG = 'kawaii.mood.sleepwake.wake';
export const SW_SLEEP_TAG = 'kawaii.mood.sleepwake.sleep';
/** Bag of friendly opener lines for the recurring check-in. Picked at random
 *  per fire so it feels less like a robot. */
export const FRIEND_OPENERS: Array<{ title: string; body: string }> = [
  { title: 'Hey 👋 how are you feeling?', body: 'Tap a mood — I’ll change your wallpaper to match.' },
  { title: 'Quick mood check 💭', body: 'How’s the vibe right now?' },
  { title: 'Checking in 🫶', body: 'Pick a feeling — wallpaper updates instantly.' },
  { title: 'How’s it going? 😊', body: 'One tap below sets your wallpaper.' },
  { title: 'Mood check-in ✨', body: 'Tell me how you feel — I’ll handle the rest.' },
];

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

export {
  DAILY_ID,
  FRIEND_ID,
  SW_WAKE_ID,
  SW_SLEEP_ID,
  MOOD_PROMPT_NOW_ID,
  FRIEND_CHAIN_PREFIX,
  FRIEND_BATCH_COUNT,
};

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

export function clampCheckInMinutes(n: number): number {
  if (!Number.isFinite(n)) return 60;
  return Math.max(FRIEND_CHECK_IN_MIN, Math.min(FRIEND_CHECK_IN_MAX, Math.round(n)));
}
