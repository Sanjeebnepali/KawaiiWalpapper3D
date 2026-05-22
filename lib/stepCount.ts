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
 */

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

/** Best-effort permission request. Resolves to true on success. */
export async function ensureMotionPermission(): Promise<boolean> {
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
 *   'unsupported'  — device has no pedometer (e.g. an emulator); steps
 *                    will never be available; mood falls back to time only
 *   'unlinked'     — native module isn't built into this binary yet
 *                    (typically a fresh dev session before `expo run:android`)
 */
export type StepStatus =
  | 'available'
  | 'no-permission'
  | 'unsupported'
  | 'unlinked';

export async function getStepStatus(): Promise<StepStatus> {
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
