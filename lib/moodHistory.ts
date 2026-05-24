import type { MoodId } from '../constants/moods';
import {
  DEDUPE_SOURCES,
  DEDUPE_WINDOW_MS,
  getStorage,
  isMissingNativeModule,
  LAST_MOOD_KEY,
  markBridgeDead,
  MOOD_HISTORY_LIMIT,
  STORAGE_KEY,
} from './moodHistory.storage';
import type { MoodHistoryEntry, MoodSource } from './moodHistory.types';

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

export { MOOD_HISTORY_LIMIT } from './moodHistory.storage';
export type {
  LoadedMoodMode,
  MoodHistoryEntry,
  MoodSource,
} from './moodHistory.types';
export {
  loadMoodMode,
  saveAppOpenEnabled,
  saveAppOpenTargets,
  saveBgEnabled,
  saveCurrentMoodPhoto,
  saveFriendCheckInEnabled,
  saveFriendCheckInMinutes,
  saveLastBgMood,
  saveLastEnabledDriver,
  saveMoodCollection,
  saveMoodModeEnabled,
  saveNotifEnabled,
  saveNotifHour,
  saveRotateWithinMood,
  saveSleepWakeCustomSleep,
  saveSleepWakeCustomWake,
  saveSleepWakeEnabled,
  saveSleepWakeLastSleepDay,
  saveSleepWakeLastWakeDay,
  saveSleepWakePack,
  saveSleepWakeSleepHour,
  saveSleepWakeWakeHour,
} from './moodHistory.persistence';

// In-memory fallback so the feature still works pre-rebuild.
let memHistory: MoodHistoryEntry[] = [];
let memLastMood: MoodId | null = null;

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
