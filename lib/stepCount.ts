/**
 * Step-count helper.
 *
 * Wraps `expo-sensors`' `Pedometer` so background tasks can read the user's
 * recent activity without forcing the rest of the app to import expo-sensors
 * at parse time.
 *
 * Returns `null` whenever step data isn't reachable — pedometer unavailable
 * on the device, permission denied, the native bridge not linked yet, or the
 * call throws for any other reason. Callers (`lib/contextMood.ts`) treat
 * `null` as "no motion signal" and fall back to time/weekday alone.
 *
 * ANDROID LIMITATION (verified): `Pedometer.getStepCountAsync(start, end)` is
 * an iOS-only date-range query. The Android `PedometerModule` in
 * `node_modules/expo-sensors` UNCONDITIONALLY throws `NotSupportedException`
 * for that call — there is no historical step API on Android via expo-sensors
 * (only a live, foreground-only step *stream* exists, which the background
 * task can't use). So on Android we never attempt the read: `getStepStatus`
 * returns `'unsupported'`, `recentSteps` returns `null`, `ensureMotionPermission`
 * is a no-op, and mood inference falls back to time-of-day. This keeps the
 * feature HONEST (no toast claiming "steps tracking", no scary motion
 * permission prompt) rather than pretending walking moves the wallpaper when
 * it can't. The iOS path is unchanged — getStepCountAsync works there.
 */

import { Platform } from 'react-native';

type PedometerLike = {
  isAvailableAsync?: () => Promise<boolean>;
  getPermissionsAsync?: () => Promise<{ granted?: boolean; canAskAgain?: boolean }>;
  requestPermissionsAsync?: () => Promise<{ granted?: boolean; canAskAgain?: boolean }>;
  getStepCountAsync?: (start: Date, end: Date) => Promise<{ steps: number } | null>;
};

let mod: { Pedometer?: PedometerLike } | null = null;
let resolved = false;

function getPedometer(): PedometerLike | null {
  if (resolved) return mod?.Pedometer ?? null;
  resolved = true;
  try {

    mod = require('expo-sensors');
    return mod?.Pedometer ?? null;
  } catch {
    mod = null;
    return null;
  }
}

/**
 * Best-effort permission request. Resolves to true on success.
 *
 * Android: NO-OP — resolves `false` without prompting. The only background
 * step API (`getStepCountAsync`) throws on Android (see `recentSteps`), so
 * requesting the scary motion permission for a feature that can never read
 * steps is dishonest. iOS keeps the real prompt.
 */
export async function ensureMotionPermission(): Promise<boolean> {
  if (Platform.OS === 'android') return false;
  const p = getPedometer();
  if (!p?.getPermissionsAsync) return false;
  try {
    const cur = await p.getPermissionsAsync();
    if (cur?.granted) return true;
    if (!p.requestPermissionsAsync) return false;
    const next = await p.requestPermissionsAsync();
    return !!next?.granted;
  } catch {
    return false;
  }
}

/**
 * Diagnostic status for the step-count signal. Used by the Mood settings
 * row + the toggle-on flow so the user knows whether activity-based mood
 * detection ("you walked a lot → excited") is actually going to fire.
 *
 *   'available'    — sensor ready AND permission granted; steps will read
 *   'no-permission'— sensor exists but motion permission was refused
 *   'unsupported'  — no usable historical-step source; steps will never be
 *                    available; mood falls back to time only. On ANDROID
 *                    this is ALWAYS the answer — the background read API
 *                    (`getStepCountAsync`) is iOS-only and throws on Android.
 *   'unlinked'     — native module isn't built into this binary yet
 *                    (typically a fresh dev session before `expo run:android`)
 */
export type StepStatus =
  | 'available'
  | 'no-permission'
  | 'unsupported'
  | 'unlinked';

export async function getStepStatus(): Promise<StepStatus> {
  // Android: the historical-step read (`getStepCountAsync`) is iOS-only and
  // throws NotSupportedException on Android, so even if `isAvailableAsync`
  // returned true the read could never succeed. Report 'unsupported'
  // up-front instead of probing — and crucially DON'T request motion
  // permission. Mood stays driven by time-of-day on Android.
  if (Platform.OS === 'android') return 'unsupported';
  const p = getPedometer();
  if (!p?.isAvailableAsync || !p?.getPermissionsAsync) return 'unlinked';
  try {
    const ok = await p.isAvailableAsync();
    if (!ok) return 'unsupported';
    const cur = await p.getPermissionsAsync();
    if (cur?.granted) return 'available';
    return 'no-permission';
  } catch {
    return 'unlinked';
  }
}

/** Steps in the last `minutes` minutes. `null` if unavailable. */
export async function recentSteps(minutes = 60): Promise<number | null> {
  // Android: never call getStepCountAsync — it throws NotSupportedException
  // unconditionally (iOS-only date-range API). Return null so
  // `inferContextMoodNow` falls through to its time-of-day mapping.
  if (Platform.OS === 'android') return null;
  const p = getPedometer();
  if (!p?.getStepCountAsync || !p?.isAvailableAsync) return null;
  try {
    const ok = await p.isAvailableAsync();
    if (!ok) return null;
    const end = new Date();
    const start = new Date(end.getTime() - minutes * 60_000);
    const r = await p.getStepCountAsync(start, end);
    return r && typeof r.steps === 'number' ? r.steps : null;
  } catch {
    return null;
  }
}
