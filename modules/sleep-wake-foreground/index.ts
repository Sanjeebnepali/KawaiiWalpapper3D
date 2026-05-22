import { requireOptionalNativeModule } from 'expo';

/**
 * Android-only foreground service that applies the user's wake-up and
 * sleep wallpapers at the configured hours-of-day, while the app is
 * closed. Counterpart to `modules/shuffle-foreground/` — same FGS
 * notification contract, different tick model (time-of-day vs fixed
 * interval).
 *
 * Contract:
 *   - JS passes the local `file://` URIs of the two wallpapers
 *     (pre-resolved from the active pack OR the user's custom pair) +
 *     the wake hour and sleep hour as 0–23 ints.
 *   - The service starts in foreground with a low-priority ongoing
 *     notification (Android 8+ requires this for any background work
 *     to survive). Computes ms-until-next-fire (whichever of wake /
 *     sleep is sooner) and `Handler.postDelayed`s a runnable.
 *   - On fire, decodes the bitmap, calls `WallpaperManager.setBitmap`
 *     with `FLAG_SYSTEM | FLAG_LOCK`, then re-computes the next fire
 *     and re-arms. No JS context needed; no OS dispatch throttling.
 *   - `stop()` cancels the runnable, removes the notification, kills
 *     the service. The service's own SharedPreferences cache is wiped
 *     on stop so a later cold START_STICKY restart doesn't resume the
 *     old config.
 *
 * iOS no-ops (Apple doesn't permit programmatic wallpaper change). On
 * pre-rebuild JS reloads the native module isn't linked yet, so
 * `requireOptionalNativeModule` returns null and every helper here
 * degrades to a no-op `false` return.
 */

type SleepWakeForegroundModule = {
  start(
    wakeUri: string,
    sleepUri: string,
    wakeHour: number,
    sleepHour: number,
  ): void;
  stop(): void;
  isRunning(): boolean;
};

const native = requireOptionalNativeModule<SleepWakeForegroundModule>(
  'SleepWakeForeground',
);

export const isSleepWakeForegroundAvailable = native != null;

export function startSleepWakeForeground(opts: {
  wakeUri: string;
  sleepUri: string;
  wakeHour: number;
  sleepHour: number;
}): boolean {
  if (!native) return false;
  if (!opts.wakeUri || !opts.sleepUri) return false;
  // Coerce hours into 0–23 so a bogus float / out-of-range value never
  // reaches the service (which also clamps, but defence in depth).
  const wh = Math.max(0, Math.min(23, Math.floor(opts.wakeHour)));
  const sh = Math.max(0, Math.min(23, Math.floor(opts.sleepHour)));
  native.start(opts.wakeUri, opts.sleepUri, wh, sh);
  return true;
}

export function stopSleepWakeForeground(): void {
  if (!native) return;
  native.stop();
}

export function isSleepWakeForegroundRunning(): boolean {
  if (!native) return false;
  return native.isRunning();
}
