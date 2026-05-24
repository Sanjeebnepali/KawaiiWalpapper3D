import { requireOptionalNativeModule } from 'expo';
import { type EventSubscription, type NativeModule } from 'expo-modules-core';

/**
 * Android-only foreground service that drives the Mood "friend asks how
 * are you feeling?" check-in on a reliable cadence — bypassing the
 * AlarmManager / Doze coalescing that makes `expo-notifications`
 * `TIME_INTERVAL` triggers fire only in bursts when the user finally
 * opens the app.
 *
 * Why a foreground service, again:
 *   - `expo-notifications` `TIME_INTERVAL` triggers on Android route
 *     through inexact `AlarmManager.setAndAllowWhileIdle`. In Doze /
 *     app-standby / OEM battery savers (Vivo, MIUI, ColorOS) the OS
 *     coalesces alarms into the next maintenance window — which usually
 *     happens when the user UNLOCKS the device. From the user's
 *     perspective: "I set 1 min, after 5 min nothing happens, then I
 *     opened the app and got 3 notifications at once."
 *   - A foreground service running `Handler.postDelayed` is exempt
 *     from those restrictions because the OS treats it as
 *     "user-knowingly-requested ongoing work."
 *
 * Tick contract:
 *   - JS calls `start({ intervalMinutes })`. The service starts in the
 *     foreground with an ongoing low-priority notification (Android 8+
 *     mandatory) and arms a `Handler.postDelayed` for `intervalMinutes`.
 *   - On each tick the service emits an `onTick` event back to JS.
 *     JS's listener (`lib/moodBootstrap.ts`) calls
 *     `fireMoodPromptNotification()` — same code path as the existing
 *     `usage-monitor` source, so the 7-emoji category + tap handling
 *     all keep working unchanged.
 *   - Reschedule is automatic. `stop()` cancels the runnable, clears
 *     the SharedPreferences cache, removes the notification, stops
 *     the service.
 *
 * Cold-restart resilience: the interval is persisted in
 * SharedPreferences and the service is `START_STICKY`. If Android kills
 * the service (rare with FGS, but possible under extreme memory
 * pressure), the OS restarts it with a null intent and we resume the
 * schedule from prefs.
 *
 * iOS no-ops — the native module isn't built for iOS. The existing
 * `expo-notifications` schedule path still runs there as the iOS-side
 * mechanism (Apple's local notification scheduling is more reliable
 * than Android AlarmManager and doesn't need this workaround).
 */

export type FriendTickEvent = { at: number };

type FriendCheckinForegroundModule = NativeModule<{
  onTick: (ev: FriendTickEvent) => void;
}> & {
  start(intervalMinutes: number): void;
  stop(): void;
  isRunning(): boolean;
  addListener(
    event: 'onTick',
    listener: (ev: FriendTickEvent) => void,
  ): EventSubscription;
};

const native = requireOptionalNativeModule<FriendCheckinForegroundModule>(
  'FriendCheckinForeground',
);

export const isFriendCheckinForegroundAvailable = native != null;

/** Subscribe to ticks. The callback fires on the JS thread every time
 *  the native service's `Handler.postDelayed` runnable runs. Returns a
 *  subscription with a `.remove()` you MUST call when you tear the
 *  listener down (in our use the listener lives as long as the
 *  bootstrap singleton, so `.remove()` is never called). */
export function addFriendCheckinTickListener(
  cb: (ev: FriendTickEvent) => void,
): EventSubscription | null {
  if (!native) return null;
  return native.addListener('onTick', cb);
}

export function startFriendCheckinForeground(opts: {
  intervalMinutes: number;
}): boolean {
  if (!native) return false;
  // Defensive clamp — the service also clamps but we want to fail fast
  // here if a bogus float / negative slips through.
  const n = Math.max(1, Math.min(1440, Math.floor(opts.intervalMinutes)));
  native.start(n);
  return true;
}

export function stopFriendCheckinForeground(): void {
  if (!native) return;
  native.stop();
}

export function isFriendCheckinForegroundRunning(): boolean {
  if (!native) return false;
  return native.isRunning();
}
