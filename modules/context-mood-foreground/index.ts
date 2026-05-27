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
 *   - JS calls `start(intervalMinutes, payloadJson)`. `payloadJson` is a
 *     JSON-encoded `{ moodUris: { <mood>: string[] }, all: string[] }` map
 *     of LOCAL file:// URIs (pre-resolved by `lib/contextMoodForeground.ts`).
 *     The service starts in the foreground with an ongoing low-priority
 *     notification and arms an exact AlarmManager alarm.
 *   - On each tick the service APPLIES a wallpaper natively: it computes the
 *     mood from the time of day, picks a URI from that mood's bucket (or the
 *     `all` fallback), and calls `WallpaperManager.setBitmap`. It also emits
 *     `onTick` so a live JS bundle can mirror the mood into history — but the
 *     apply no longer depends on JS being alive.
 *   - `stop()` cancels the alarm, clears the SharedPreferences cache, removes
 *     the notification, stops the service.
 *
 * Cold-restart resilience: interval + payload are persisted to
 * SharedPreferences; service is `START_STICKY`; a static boot receiver re-arms
 * after a reboot.
 */

export type ContextMoodTickEvent = { at: number };

type ContextMoodForegroundModule = NativeModule<{
  onTick: (ev: ContextMoodTickEvent) => void;
}> & {
  start(intervalMinutes: number, payloadJson: string): void;
  stop(): void;
  isRunning(): boolean;
  addListener(
    event: 'onTick',
    listener: (ev: ContextMoodTickEvent) => void,
  ): EventSubscription;
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
  payloadJson: string;
}): boolean {
  if (!native) return false;
  // No payload = nothing to apply; refuse rather than starting an idle FGS
  // that posts an ongoing notification but never changes the wallpaper.
  if (!opts.payloadJson) return false;
  const n = Math.max(5, Math.min(1440, Math.floor(opts.intervalMinutes)));
  native.start(n, opts.payloadJson);
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
