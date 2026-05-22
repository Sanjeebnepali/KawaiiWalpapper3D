import { requireOptionalNativeModule } from 'expo';

/**
 * Android-only foreground service that owns the periodic wallpaper rotation
 * while the app is closed. Solves the user-reported "the timer pauses
 * when the app is closed and only resumes when I open the app" problem
 * — which is `expo-background-fetch` being silently throttled to nothing
 * by OEM background killers (Vivo OriginOS, MIUI, ColorOS) regardless of
 * how we register the WorkManager job.
 *
 * The contract:
 *   - JS passes a list of LOCAL file:// URIs (pre-downloaded into the
 *     cache directory) + the interval in ms + the mode + a starting index.
 *   - The service starts in foreground with a low-priority ongoing
 *     notification (Android 8+ requires this for any background work to
 *     survive). Sets a `Handler.postDelayed` for the next rotation.
 *   - On each tick the service applies the next URI via
 *     `WallpaperManager.setBitmap`, advances the index, and schedules
 *     the next tick. No JS context needed; no OS dispatch throttling.
 *   - `stop()` cancels the handler, removes the notification, kills the
 *     service.
 *
 * iOS no-ops (the native module isn't built for iOS). Apple doesn't
 * permit programmatic wallpaper change anyway, so the contract has no
 * equivalent on that platform.
 */
export type ShuffleMode = 'sequential' | 'random' | 'day' | 'smart';

/** What the native service last put on the screen — JS reads this on
 *  resume to sync its own "current image" + countdown to reality. */
export type LastAppliedShuffle = {
  /** Index into the URI list the service was started with. */
  index: number;
  /** ms epoch of the last successful apply. */
  at: number;
  /** The file:// URI that was applied. */
  uri: string;
};

type ShuffleForegroundModule = {
  start(
    uris: string[],
    intervalMs: number,
    mode: ShuffleMode,
    startIndex: number,
  ): void;
  stop(): void;
  /** True iff the service is currently running. */
  isRunning(): boolean;
  /** Null until the service has applied at least one wallpaper. */
  getLastApplied(): LastAppliedShuffle | null;
  /** True iff the app is exempt from battery optimization (Doze). */
  isIgnoringBatteryOptimizations(): boolean;
};

const native = requireOptionalNativeModule<ShuffleForegroundModule>(
  'ShuffleForeground',
);

export const isShuffleForegroundAvailable = native != null;

export function startShuffleForeground(opts: {
  uris: string[];
  intervalMs: number;
  mode: ShuffleMode;
  startIndex?: number;
}): boolean {
  if (!native) return false;
  if (opts.uris.length === 0) return false;
  native.start(opts.uris, opts.intervalMs, opts.mode, opts.startIndex ?? 0);
  return true;
}

export function stopShuffleForeground(): void {
  if (!native) return;
  native.stop();
}

export function isShuffleForegroundRunning(): boolean {
  if (!native) return false;
  return native.isRunning();
}

/** What the native service last applied, or null. Null on iOS / when the
 *  native module isn't linked, or before the first rotation. */
export function getLastAppliedShuffle(): LastAppliedShuffle | null {
  if (!native?.getLastApplied) return null;
  try {
    return native.getLastApplied();
  } catch {
    return null;
  }
}

/** Is the app exempt from battery optimization (Doze)? This is the device
 *  setting that decides whether background alarms fire on time. Returns
 *  true on iOS / when the native module isn't linked (so callers don't
 *  nag where it doesn't apply). */
export function isIgnoringBatteryOptimizations(): boolean {
  if (!native?.isIgnoringBatteryOptimizations) return true;
  try {
    return native.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}
