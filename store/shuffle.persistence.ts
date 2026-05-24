/**
 * File-system persistence for `store/shuffle.ts`: a debounced JSON writer to
 * cacheDirectory plus the collection id generator. Extracted so the store
 * file holds the state machine and this file holds the IO. Uses
 * `expo-file-system/legacy` (already a dep — no native rebuild; see changes/021).
 */
import * as FileSystem from 'expo-file-system/legacy';
import { type ShuffleState } from '../constants/shuffle';

export const STATE_FILE = `${FileSystem.cacheDirectory ?? ''}shuffle-state.json`;

// Debounced JSON writer. Captures the latest state on every mutation; only
// the most recent call wins. Fire-and-forget — failures log to console; the
// in-memory state is the source of truth for the live session.
let writeTimer: ReturnType<typeof setTimeout> | null = null;
export function schedulePersist(state: ShuffleState) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const payload: ShuffleState = {
      collections: state.collections,
      activeCollectionId: state.activeCollectionId,
      currentIndex: state.currentIndex,
      history: state.history,
      paused: state.paused,
      dndStart: state.dndStart,
      dndEnd: state.dndEnd,
      lastChangedAt: state.lastChangedAt,
    };
    FileSystem.writeAsStringAsync(STATE_FILE, JSON.stringify(payload)).catch(
      (e) => console.warn('[shuffle] persist failed:', e),
    );
  }, 250);
}

export function genId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
