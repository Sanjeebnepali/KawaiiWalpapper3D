import { create } from 'zustand';

type FavoritesState = {
  ids: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (id: string) => void;
  clear: () => void;
};

/**
 * Favorites store. Holds the wallpaper ids the user has hearted.
 *
 * Persisted to AsyncStorage so the new "My Favorites" screen survives a
 * cold launch — previously the list reset on every restart (changes/007
 * follow-up). Lazy-required like every other store in the project so the
 * JS-only reload path before a native rebuild still boots cleanly.
 */

const PERSIST_KEY = '@kawaii/favorites@v1';

type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
};

let storage: AsyncStorageLike | null = null;
let storageResolved = false;
function getStorage(): AsyncStorageLike | null {
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
function schedulePersist(ids: string[]) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const s = getStorage();
    if (!s) return;
    s.setItem(PERSIST_KEY, JSON.stringify(ids)).catch(() => {
      /* in-memory is authoritative for the session */
    });
  }, 200);
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: [],
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    const s = getStorage();
    if (!s) {
      set({ hydrated: true });
      return;
    }
    try {
      const raw = await s.getItem(PERSIST_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          // CORE-8: merge persisted ids with anything the user toggled in the
          // ~tens-of-ms window before this async read resolved, rather than
          // overwriting wholesale (which would drop the early action). Union
          // by id, persisted first to keep a stable order.
          const early = get().ids;
          const merged = early.length
            ? Array.from(new Set([...parsed, ...early]))
            : parsed;
          set({ ids: merged, hydrated: true });
          // The merge may differ from disk (an early toggle) — persist it now
          // that we're hydrated.
          if (early.length) schedulePersist(merged);
          return;
        }
      }
    } catch {
      /* fall through — use empty list */
    }
    set({ hydrated: true });
    // If the user toggled before hydrate landed, that in-memory state was
    // never written (writes are gated below). Flush it now.
    const ids = get().ids;
    if (ids.length) schedulePersist(ids);
  },
  toggle: (id) =>
    set((s) => {
      const next = s.ids.includes(id)
        ? s.ids.filter((x) => x !== id)
        : [...s.ids, id];
      // CORE-8: only schedule a disk write once hydrated, so an early action
      // can't write default/empty state that lands after hydrate() and
      // clobbers the persisted list. The in-memory update still applies
      // immediately (UI stays responsive); hydrate() merges + flushes it.
      if (s.hydrated) schedulePersist(next);
      return { ids: next };
    }),
  clear: () => {
    set({ ids: [] });
    if (get().hydrated) schedulePersist([]);
  },
}));

export const hydrateFavoritesStore = () => useFavoritesStore.getState().hydrate();

/** Re-renders the caller only when THIS id's favorite status flips. */
export const useIsFavorite = (id: string) =>
  useFavoritesStore((s) => s.ids.includes(id));

/** Stable action selector — safe to call in render without causing re-renders. */
export const useToggleFavorite = () => useFavoritesStore((s) => s.toggle);
