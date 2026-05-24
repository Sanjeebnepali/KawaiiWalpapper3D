/**
 * Persistence layer for `store/ai.ts` (mirrors `store/settings.ts`): lazy
 * AsyncStorage resolution, debounced write, and a local-day key. Extracted
 * so the store file holds the state machine and this file holds the IO.
 */
import type { AIState } from './ai.types';

export const PERSIST_KEY = '@kawaii/ai@v1';

type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
};

let storage: AsyncStorageLike | null = null;
let storageResolved = false;
export function getStorage(): AsyncStorageLike | null {
  if (storageResolved) return storage;
  storageResolved = true;
  try {

    const mod = require('@react-native-async-storage/async-storage');
    storage = (mod?.default ?? mod) as AsyncStorageLike;
  } catch {
    storage = null;
  }
  return storage;
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePersist(state: AIState) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const s = getStorage();
    if (!s) return;
    s.setItem(PERSIST_KEY, JSON.stringify(state)).catch(() => {
      /* swallow — in-memory is authoritative for the session */
    });
  }, 200);
}

/** Local-day key — UTC offset would mis-count quota across midnight. */
export function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
