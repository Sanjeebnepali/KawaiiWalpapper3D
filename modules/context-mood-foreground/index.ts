import { requireOptionalNativeModule } from 'expo';
import { type EventSubscription, type NativeModule } from 'expo-modules-core';

/**
 * Android-only foreground service that ticks every N minutes so the
 * JS-side context-mood inference (`lib/moodBackgroundTask`:
 * `runMoodBackgroundOnce`) actually runs while the app is closed.
 *
 * Replaces (but doesn't displace) the previous `expo-background-fetch`
 * WorkManager registration. The WorkManager path is kept as the iOS
 * implementation + as a dev-session fallback before the native module
 * is linked; on Android with the FGS available, the FGS is the primary
 * driver because OEM background killers (Vivo OriginOS, MIUI,
 * ColorOS) silently drop WorkManager periodic work, while a foreground
 * service with an ongoing notification is the OS-sanctioned contract
 * that survives them.
 *
 * Tick contract:
 *   - JS calls `start({ intervalMinutes })` (default 30 min). The
 *     service starts in the foreground with an ongoing low-priority
 *     notification and arms `Handler.postDelayed(intervalMinutes * 60_000)`.
 *   - On each tick the service emits an `onTick` event back to JS.
 *     JS's listener (`lib/moodBootstrap.ts`) calls
 *     `runMoodBackgroundOnce()` — the existing context-inference +
 *     silent wallpaper-apply path.
 *   - `stop()` cancels the runnable, clears the SharedPreferences
 *     cache, removes the notification, stops the service.
 *
 * Cold-restart resilience: interval is persisted to
 * SharedPreferences; service is `START_STICKY`.
 */

export type ContextMoodTickEvent = { at: number };

type ContextMoodForegroundModule = NativeModule<{
  onTick: (ev: ContextMoodTickEvent) => void;
}> & {
  start(intervalMinutes: number): void;
  stop(): void;
  isRunning(): boolean;
};

const native = requireOptionalNativeModule<ContextMoodForegroundModule>(
  'ContextMoodForeground',
);

export const isContextMoodForegroundAvailable = native != null;

export function addContextMoodTickListener(
  cb: (ev: ContextMoodTickEvent) => void,
): EventSubscription | null {
  if (!native) return null;
  return native.addListener('onTick', cb);
}

export function startContextMoodForeground(opts: {
  intervalMinutes: number;
}): boolean {
  if (!native) return false;
  const n = Math.max(5, Math.min(1440, Math.floor(opts.intervalMinutes)));
  native.start(n);
  return true;
}

export function stopContextMoodForeground(): void {
  if (!native) return;
  native.stop();
}

export function isContextMoodForegroundRunning(): boolean {
  if (!native) return false;
  return native.isRunning();
}
