import type { MoodId } from '../constants/moods';
import type { TargetAppId } from './appUsageMonitor';

/**
 * Mood history persistence.
 *
 * Uses `@react-native-async-storage/async-storage` per spec. The module is
 * required lazily inside a try/catch so the manual mood selector still works
 * end-to-end even if the native bridge hasn't been re-linked yet (e.g. before
 * the user has run `npx expo run:android` after `npm install`). When the
 * native module is missing, history falls back to an in-memory ring buffer
 * that lives for the app session.
 */

export type MoodSource =
  | 'manual'
  | 'camera'
  | 'background'
  | 'notification'
  | 'sleepwake';

export type MoodHistoryEntry = {
  /** Stable id — `${at}-${moodId}` is unique within reason. */
  id: string;
  moodId: MoodId;
  at: number;
  source: MoodSource;
  /** 0–1 confidence. Manual selections are always 1. */
  confidence: number;
};

/** Hard cap so the JSON blob stays tiny. */
export const MOOD_HISTORY_LIMIT = 60;
/** Auto-driven entries (camera scan loop, context background ticks, and the
 *  sleep/wake fallback) arriving inside this window of the previous entry
 *  with the SAME mood are deduplicated — prevents the 60 s scan loop and the
 *  ~30 min background ticks from flooding history with "Happy, Happy, Happy"
 *  and evicting the user's manual/camera entries from the 60-slot ring.
 *  Manual + notification taps are NEVER deduped — those are explicit user
 *  actions we always want recorded. Audit MOOD-7. */
const DEDUPE_WINDOW_MS = 4 * 60 * 1000; // 4 min
/** Sources whose same-mood-within-window repeats are noise, not signal. */
const DEDUPE_SOURCES: ReadonlySet<MoodSource> = new Set<MoodSource>([
  'camera',
  'background',
  'sleepwake',
]);

const STORAGE_KEY = '@kawaii/mood/history@v1';
const LAST_MOOD_KEY = '@kawaii/mood/last@v1';
const MODE_ENABLED_KEY = '@kawaii/mood/mode@v1';
const MODE_COLLECTION_KEY = '@kawaii/mood/collection@v1';
const CURRENT_PHOTO_KEY = '@kawaii/mood/currentPhoto@v1';
const BG_ENABLED_KEY = '@kawaii/mood/bg@v1';
const NOTIF_ENABLED_KEY = '@kawaii/mood/notif@v1';
const NOTIF_HOUR_KEY = '@kawaii/mood/notifHour@v1';
const LAST_BG_MOOD_KEY = '@kawaii/mood/lastBgMood@v1';
const APP_OPEN_ENABLED_KEY = '@kawaii/mood/appOpen@v1';
const APP_OPEN_TARGETS_KEY = '@kawaii/mood/appOpenTargets@v1';
const FRIEND_ENABLED_KEY = '@kawaii/mood/friend@v1';
const FRIEND_MINUTES_KEY = '@kawaii/mood/friendMin@v1';
const SW_ENABLED_KEY = '@kawaii/mood/sw@v1';
const SW_PACK_KEY = '@kawaii/mood/swPack@v1';
const SW_WAKE_HOUR_KEY = '@kawaii/mood/swWake@v1';
const SW_SLEEP_HOUR_KEY = '@kawaii/mood/swSleep@v1';
/** ISO day strings ('YYYY-MM-DD') of the last day we successfully applied
 *  the wake / sleep image. Used by the bg-task fallback to avoid re-applying
 *  on a tick that happens hours after we already applied. */
const SW_LAST_WAKE_DAY_KEY = '@kawaii/mood/swLastWakeDay@v1';
const SW_LAST_SLEEP_DAY_KEY = '@kawaii/mood/swLastSleepDay@v1';
const SW_CUSTOM_WAKE_KEY = '@kawaii/mood/swCustomWake@v1';
const SW_CUSTOM_SLEEP_KEY = '@kawaii/mood/swCustomSleep@v1';
/** The continuous driver ('theme' | 'mood' | 'friend') the user most recently
 *  enabled. Used by the bootstrap single-driver normalization so a legacy
 *  multi-driver state keeps the user's last choice instead of the fixed
 *  DRIVERS-order winner. Audit MOOD-4. */
const LAST_ENABLED_DRIVER_KEY = '@kawaii/mood/lastEnabledDriver@v1';

type AsyncStorageLike = {
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

function getStorage(): AsyncStorageLike | null {
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
function parseNum(
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

function isMissingNativeModule(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return (
    msg.includes('Native module') ||
    msg.includes('TurboModuleRegistry') ||
    msg.includes('RNCAsyncStorage') ||
    msg.includes('null is not an object')
  );
}

function markBridgeDead(e: unknown): void {
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

// In-memory fallback so the feature still works pre-rebuild.
let memHistory: MoodHistoryEntry[] = [];
let memLastMood: MoodId | null = null;
let memModeEnabled = false;
let memModeCollection: string | null = null;
let memCurrentPhoto: string | null = null;
let memBgEnabled = false;
let memNotifEnabled = false;
let memNotifHour = 8;
let memLastBgMood: MoodId | null = null;
let memAppOpenEnabled = false;
let memAppOpenTargets: TargetAppId[] | null = null;
let memFriendEnabled = false;
let memFriendMinutes = 60;
let memSwEnabled = false;
let memSwPack: string | null = null;
let memSwWakeHour = 7;
let memSwSleepHour = 22;
let memSwLastWakeDay: string | null = null;
let memSwLastSleepDay: string | null = null;
let memSwCustomWake: string | null = null;
let memSwCustomSleep: string | null = null;
let memLastEnabledDriver: string | null = null;

export async function loadMoodHistory(): Promise<MoodHistoryEntry[]> {
  const s = getStorage();
  if (!s) return memHistory.slice();
  try {
    const raw = await s.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MoodHistoryEntry[]) : [];
  } catch (e) {
    if (isMissingNativeModule(e)) {
      markBridgeDead(e);
      return memHistory.slice();
    }
    return [];
  }
}

export async function loadLastMood(): Promise<MoodId | null> {
  const s = getStorage();
  if (!s) return memLastMood;
  try {
    const raw = await s.getItem(LAST_MOOD_KEY);
    return (raw as MoodId | null) ?? null;
  } catch (e) {
    if (isMissingNativeModule(e)) {
      markBridgeDead(e);
      return memLastMood;
    }
    return null;
  }
}

/** Serializes recordMood calls. Concurrent producers — the FGS context
 *  tick, the OS bg-fetch task, and a user tap — can all call recordMood at
 *  once; without a queue each does its own read-modify-write of the same
 *  history blob and the last writer clobbers the others' new entries. We
 *  chain every call onto a single tail promise so they run strictly in
 *  order. Audit MOOD-7. */
let recordTail: Promise<unknown> = Promise.resolve();

/**
 * Append a mood detection, dedupe same-mood-within-window (auto sources only),
 * cap at LIMIT, and persist last-mood for boot-time hydration. Returns the new
 * history list. Calls are serialized through a module-level promise queue so
 * concurrent writers don't read-modify-write over each other.
 */
export function recordMood(
  moodId: MoodId,
  source: MoodSource,
  confidence = 1,
): Promise<MoodHistoryEntry[]> {
  const run = recordTail.then(() => recordMoodInner(moodId, source, confidence));
  // Keep the queue alive even if a write rejects — swallow on the tail only
  // (the returned `run` still surfaces the real result/error to the caller).
  recordTail = run.catch(() => {});
  return run;
}

async function recordMoodInner(
  moodId: MoodId,
  source: MoodSource,
  confidence: number,
): Promise<MoodHistoryEntry[]> {
  const now = Date.now();
  const prev = await loadMoodHistory();
  const last = prev[0];
  // Dedupe same-mood repeats from the AUTO sources (camera scan loop,
  // context background ticks, sleep/wake fallback). Manual + notification
  // taps are explicit user actions and always recorded. Audit MOOD-7.
  const isAutoDupe =
    DEDUPE_SOURCES.has(source) &&
    last?.moodId === moodId &&
    now - last.at < DEDUPE_WINDOW_MS;

  let next = prev;
  if (!isAutoDupe) {
    const entry: MoodHistoryEntry = {
      id: `${now}-${moodId}-${source}`,
      moodId,
      at: now,
      source,
      confidence: Math.max(0, Math.min(1, confidence)),
    };
    next = [entry, ...prev].slice(0, MOOD_HISTORY_LIMIT);
  }

  // Always mirror to the in-memory buffer first so a runtime AsyncStorage
  // failure mid-write still leaves the session-local store consistent.
  memHistory = next;
  memLastMood = moodId;

  const s = getStorage();
  if (s) {
    try {
      await s.setItem(STORAGE_KEY, JSON.stringify(next));
      await s.setItem(LAST_MOOD_KEY, moodId);
    } catch (e) {
      if (isMissingNativeModule(e)) markBridgeDead(e);
      // swallow — mem buffer already holds the new state.
    }
  }

  return next;
}

export async function clearMoodHistory(): Promise<void> {
  memHistory = [];
  memLastMood = null;
  const s = getStorage();
  if (s) {
    try {
      await s.removeItem(STORAGE_KEY);
      await s.removeItem(LAST_MOOD_KEY);
    } catch (e) {
      if (isMissingNativeModule(e)) markBridgeDead(e);
    }
  }
}

// ─── Mood Mode persistence ─────────────────────────────────────────────────

export type LoadedMoodMode = {
  enabled: boolean;
  collectionId: string | null;
  currentPhotoId: string | null;
  bgEnabled: boolean;
  notifEnabled: boolean;
  notifHour: number;
  lastBgMood: MoodId | null;
  appOpenEnabled: boolean;
  appOpenTargets: TargetAppId[] | null;
  friendCheckInEnabled: boolean;
  friendCheckInMinutes: number;
  sleepWakeEnabled: boolean;
  sleepWakePackId: string | null;
  sleepWakeWakeHour: number;
  sleepWakeSleepHour: number;
  sleepWakeLastWakeDay: string | null;
  sleepWakeLastSleepDay: string | null;
  /** When sleepWakePackId === 'custom', these hold the two user-picked
   *  photo IDs. Resolved against `getPhotoById` / `searchCatalog`. */
  sleepWakeCustomWakeId: string | null;
  sleepWakeCustomSleepId: string | null;
  /** The continuous driver the user most recently enabled. Narrowed to a
   *  `DriverId` by the consumer (lib/automationMode). Audit MOOD-4. */
  lastEnabledDriver: string | null;
};

function memSnapshot(): LoadedMoodMode {
  return {
    enabled: memModeEnabled,
    collectionId: memModeCollection,
    currentPhotoId: memCurrentPhoto,
    bgEnabled: memBgEnabled,
    notifEnabled: memNotifEnabled,
    notifHour: memNotifHour,
    lastBgMood: memLastBgMood,
    appOpenEnabled: memAppOpenEnabled,
    appOpenTargets: memAppOpenTargets,
    friendCheckInEnabled: memFriendEnabled,
    friendCheckInMinutes: memFriendMinutes,
    sleepWakeEnabled: memSwEnabled,
    sleepWakePackId: memSwPack,
    sleepWakeWakeHour: memSwWakeHour,
    sleepWakeSleepHour: memSwSleepHour,
    sleepWakeLastWakeDay: memSwLastWakeDay,
    sleepWakeLastSleepDay: memSwLastSleepDay,
    sleepWakeCustomWakeId: memSwCustomWake,
    sleepWakeCustomSleepId: memSwCustomSleep,
    lastEnabledDriver: memLastEnabledDriver,
  };
}

export async function loadMoodMode(): Promise<LoadedMoodMode> {
  const s = getStorage();
  if (!s) return memSnapshot();
  try {
    const [
      enabledRaw, collId, photoId,
      bgRaw, notifRaw, notifHourRaw, lastBgRaw,
      appOpenRaw, appOpenTargetsRaw,
      friendRaw, friendMinRaw,
      swRaw, swPackRaw, swWakeRaw, swSleepRaw,
      swLastWakeRaw, swLastSleepRaw,
      swCustomWakeRaw, swCustomSleepRaw,
      lastEnabledDriverRaw,
    ] = await Promise.all([
      s.getItem(MODE_ENABLED_KEY),
      s.getItem(MODE_COLLECTION_KEY),
      s.getItem(CURRENT_PHOTO_KEY),
      s.getItem(BG_ENABLED_KEY),
      s.getItem(NOTIF_ENABLED_KEY),
      s.getItem(NOTIF_HOUR_KEY),
      s.getItem(LAST_BG_MOOD_KEY),
      s.getItem(APP_OPEN_ENABLED_KEY),
      s.getItem(APP_OPEN_TARGETS_KEY),
      s.getItem(FRIEND_ENABLED_KEY),
      s.getItem(FRIEND_MINUTES_KEY),
      s.getItem(SW_ENABLED_KEY),
      s.getItem(SW_PACK_KEY),
      s.getItem(SW_WAKE_HOUR_KEY),
      s.getItem(SW_SLEEP_HOUR_KEY),
      s.getItem(SW_LAST_WAKE_DAY_KEY),
      s.getItem(SW_LAST_SLEEP_DAY_KEY),
      s.getItem(SW_CUSTOM_WAKE_KEY),
      s.getItem(SW_CUSTOM_SLEEP_KEY),
      s.getItem(LAST_ENABLED_DRIVER_KEY),
    ]);
    let appOpenTargets: TargetAppId[] | null = null;
    if (appOpenTargetsRaw) {
      try {
        const parsed = JSON.parse(appOpenTargetsRaw);
        if (Array.isArray(parsed)) appOpenTargets = parsed as TargetAppId[];
      } catch { /* fall through to null → default */ }
    }
    return {
      enabled: enabledRaw === '1',
      collectionId: collId ?? null,
      currentPhotoId: photoId ?? null,
      bgEnabled: bgRaw === '1',
      notifEnabled: notifRaw === '1',
      notifHour: parseNum(notifHourRaw, 8, 0, 23),
      lastBgMood: (lastBgRaw as MoodId | null) ?? null,
      appOpenEnabled: appOpenRaw === '1',
      appOpenTargets,
      friendCheckInEnabled: friendRaw === '1',
      friendCheckInMinutes: parseNum(friendMinRaw, 60, 1, 24 * 60),
      sleepWakeEnabled: swRaw === '1',
      sleepWakePackId: swPackRaw ?? null,
      sleepWakeWakeHour: parseNum(swWakeRaw, 7, 0, 23),
      sleepWakeSleepHour: parseNum(swSleepRaw, 22, 0, 23),
      sleepWakeLastWakeDay: swLastWakeRaw ?? null,
      sleepWakeLastSleepDay: swLastSleepRaw ?? null,
      sleepWakeCustomWakeId: swCustomWakeRaw ?? null,
      sleepWakeCustomSleepId: swCustomSleepRaw ?? null,
      lastEnabledDriver: lastEnabledDriverRaw ?? null,
    };
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
    return memSnapshot();
  }
}

export async function saveLastEnabledDriver(driver: string | null): Promise<void> {
  memLastEnabledDriver = driver;
  const s = getStorage();
  if (!s) return;
  try {
    if (driver) await s.setItem(LAST_ENABLED_DRIVER_KEY, driver);
    else await s.removeItem(LAST_ENABLED_DRIVER_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveAppOpenEnabled(enabled: boolean): Promise<void> {
  memAppOpenEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(APP_OPEN_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveAppOpenTargets(targets: TargetAppId[]): Promise<void> {
  memAppOpenTargets = targets;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(APP_OPEN_TARGETS_KEY, JSON.stringify(targets)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveFriendCheckInEnabled(enabled: boolean): Promise<void> {
  memFriendEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(FRIEND_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveFriendCheckInMinutes(minutes: number): Promise<void> {
  memFriendMinutes = minutes;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(FRIEND_MINUTES_KEY, String(minutes)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeEnabled(enabled: boolean): Promise<void> {
  memSwEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakePack(id: string | null): Promise<void> {
  memSwPack = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_PACK_KEY, id);
    else await s.removeItem(SW_PACK_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeWakeHour(hour: number): Promise<void> {
  memSwWakeHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_WAKE_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeSleepHour(hour: number): Promise<void> {
  memSwSleepHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(SW_SLEEP_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeLastWakeDay(day: string | null): Promise<void> {
  memSwLastWakeDay = day;
  const s = getStorage();
  if (!s) return;
  try {
    if (day) await s.setItem(SW_LAST_WAKE_DAY_KEY, day);
    else await s.removeItem(SW_LAST_WAKE_DAY_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeLastSleepDay(day: string | null): Promise<void> {
  memSwLastSleepDay = day;
  const s = getStorage();
  if (!s) return;
  try {
    if (day) await s.setItem(SW_LAST_SLEEP_DAY_KEY, day);
    else await s.removeItem(SW_LAST_SLEEP_DAY_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeCustomWake(id: string | null): Promise<void> {
  memSwCustomWake = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_CUSTOM_WAKE_KEY, id);
    else await s.removeItem(SW_CUSTOM_WAKE_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveSleepWakeCustomSleep(id: string | null): Promise<void> {
  memSwCustomSleep = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(SW_CUSTOM_SLEEP_KEY, id);
    else await s.removeItem(SW_CUSTOM_SLEEP_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveBgEnabled(enabled: boolean): Promise<void> {
  memBgEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(BG_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveNotifEnabled(enabled: boolean): Promise<void> {
  memNotifEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(NOTIF_ENABLED_KEY, enabled ? '1' : '0'); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveNotifHour(hour: number): Promise<void> {
  memNotifHour = hour;
  const s = getStorage();
  if (!s) return;
  try { await s.setItem(NOTIF_HOUR_KEY, String(hour)); }
  catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveLastBgMood(mood: MoodId | null): Promise<void> {
  memLastBgMood = mood;
  const s = getStorage();
  if (!s) return;
  try {
    if (mood) await s.setItem(LAST_BG_MOOD_KEY, mood);
    else await s.removeItem(LAST_BG_MOOD_KEY);
  } catch (e) { if (isMissingNativeModule(e)) markBridgeDead(e); }
}

export async function saveMoodModeEnabled(enabled: boolean): Promise<void> {
  memModeEnabled = enabled;
  const s = getStorage();
  if (!s) return;
  try {
    await s.setItem(MODE_ENABLED_KEY, enabled ? '1' : '0');
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}

export async function saveMoodCollection(id: string | null): Promise<void> {
  memModeCollection = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(MODE_COLLECTION_KEY, id);
    else await s.removeItem(MODE_COLLECTION_KEY);
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}

export async function saveCurrentMoodPhoto(id: string | null): Promise<void> {
  memCurrentPhoto = id;
  const s = getStorage();
  if (!s) return;
  try {
    if (id) await s.setItem(CURRENT_PHOTO_KEY, id);
    else await s.removeItem(CURRENT_PHOTO_KEY);
  } catch (e) {
    if (isMissingNativeModule(e)) markBridgeDead(e);
  }
}
