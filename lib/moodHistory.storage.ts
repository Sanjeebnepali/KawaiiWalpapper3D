import type { MoodSource } from './moodHistory.types';

/**
 * Mood history persistence layer.
 *
 * Uses `@react-native-async-storage/async-storage` per spec. The module is
 * required lazily inside a try/catch so the manual mood selector still works
 * end-to-end even if the native bridge hasn't been re-linked yet (e.g. before
 * the user has run `npx expo run:android` after `npm install`). When the
 * native module is missing, history falls back to an in-memory ring buffer
 * that lives for the app session.
 */

/** Hard cap so the JSON blob stays tiny. */
export const MOOD_HISTORY_LIMIT = 60;
/** Auto-driven entries (camera scan loop, context background ticks, and the
 *  sleep/wake fallback) arriving inside this window of the previous entry
 *  with the SAME mood are deduplicated — prevents the 60 s scan loop and the
 *  ~30 min background ticks from flooding history with "Happy, Happy, Happy"
 *  and evicting the user's manual/camera entries from the 60-slot ring.
 *  Manual + notification taps are NEVER deduped — those are explicit user
 *  actions we always want recorded. Audit MOOD-7. */
export const DEDUPE_WINDOW_MS = 4 * 60 * 1000; // 4 min
/** Sources whose same-mood-within-window repeats are noise, not signal. */
export const DEDUPE_SOURCES: ReadonlySet<MoodSource> = new Set<MoodSource>([
  'camera',
  'background',
  'sleepwake',
]);

export const STORAGE_KEY = '@kawaii/mood/history@v1';
export const LAST_MOOD_KEY = '@kawaii/mood/last@v1';
export const MODE_ENABLED_KEY = '@kawaii/mood/mode@v1';
export const MODE_COLLECTION_KEY = '@kawaii/mood/collection@v1';
export const CURRENT_PHOTO_KEY = '@kawaii/mood/currentPhoto@v1';
export const BG_ENABLED_KEY = '@kawaii/mood/bg@v1';
export const NOTIF_ENABLED_KEY = '@kawaii/mood/notif@v1';
export const NOTIF_HOUR_KEY = '@kawaii/mood/notifHour@v1';
export const LAST_BG_MOOD_KEY = '@kawaii/mood/lastBgMood@v1';
/** When true, the background mood tick rotates to a DIFFERENT photo in the
 *  same mood bucket every tick (lively). When false (default), it keeps one
 *  photo per mood and only changes the wallpaper when the mood itself changes. */
export const ROTATE_WITHIN_MOOD_KEY = '@kawaii/mood/rotateWithinMood@v1';
export const APP_OPEN_ENABLED_KEY = '@kawaii/mood/appOpen@v1';
export const APP_OPEN_TARGETS_KEY = '@kawaii/mood/appOpenTargets@v1';
export const FRIEND_ENABLED_KEY = '@kawaii/mood/friend@v1';
export const FRIEND_MINUTES_KEY = '@kawaii/mood/friendMin@v1';
export const SW_ENABLED_KEY = '@kawaii/mood/sw@v1';
export const SW_PACK_KEY = '@kawaii/mood/swPack@v1';
export const SW_WAKE_HOUR_KEY = '@kawaii/mood/swWake@v1';
export const SW_SLEEP_HOUR_KEY = '@kawaii/mood/swSleep@v1';
/** ISO day strings ('YYYY-MM-DD') of the last day we successfully applied
 *  the wake / sleep image. Used by the bg-task fallback to avoid re-applying
 *  on a tick that happens hours after we already applied. */
export const SW_LAST_WAKE_DAY_KEY = '@kawaii/mood/swLastWakeDay@v1';
export const SW_LAST_SLEEP_DAY_KEY = '@kawaii/mood/swLastSleepDay@v1';
export const SW_CUSTOM_WAKE_KEY = '@kawaii/mood/swCustomWake@v1';
export const SW_CUSTOM_SLEEP_KEY = '@kawaii/mood/swCustomSleep@v1';
/** The continuous driver ('theme' | 'mood' | 'friend') the user most recently
 *  enabled. Used by the bootstrap single-driver normalization so a legacy
 *  multi-driver state keeps the user's last choice instead of the fixed
 *  DRIVERS-order winner. Audit MOOD-4. */
export const LAST_ENABLED_DRIVER_KEY = '@kawaii/mood/lastEnabledDriver@v1';

export type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

let storageImpl: AsyncStorageLike | null = null;
let storageResolved = false;
/** Set the first time a real AsyncStorage call rejects with a "native module
 *  not found" error, so subsequent calls skip straight to the in-memory
 *  fallback rather than re-paying the bridge round-trip. Audit finding #6. */
let nativeBridgeDead = false;

export function getStorage(): AsyncStorageLike | null {
  if (nativeBridgeDead) return null;
  if (storageResolved) return storageImpl;
  storageResolved = true;
  try {

    const mod = require('@react-native-async-storage/async-storage');
    storageImpl = (mod?.default ?? mod) as AsyncStorageLike;
  } catch {
    if (__DEV__) {
      console.warn(
        '[moodHistory] AsyncStorage not linked — history will not persist across launches. ' +
          'Run `npm install --legacy-peer-deps && npx expo run:android` to enable persistence.',
      );
    }
    storageImpl = null;
  }
  return storageImpl;
}

/**
 * Parse a stored numeric string, falling back to `def` when the value is
 * missing, non-numeric (NaN), or outside [min, max]. A corrupt stored hour
 * previously yielded `NaN` straight into the OS notification trigger, which
 * silently never schedules. Audit MOOD-6.
 */
export function parseNum(
  raw: string | null,
  def: number,
  min: number,
  max: number,
): number {
  if (raw == null) return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) return def;
  return n;
}

export function isMissingNativeModule(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return (
    msg.includes('Native module') ||
    msg.includes('TurboModuleRegistry') ||
    msg.includes('RNCAsyncStorage') ||
    msg.includes('null is not an object')
  );
}

export function markBridgeDead(e: unknown): void {
  if (nativeBridgeDead) return;
  nativeBridgeDead = true;
  storageImpl = null;
  if (__DEV__) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      '[moodHistory] AsyncStorage native bridge unavailable at runtime — ' +
        'falling back to in-memory history for this session. ' +
        `Underlying error: ${msg}`,
    );
  }
}
