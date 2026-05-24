import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import {
  type Collection,
  COLLECTION_SIZE,
  FREE_COLLECTION_LIMIT,
  HISTORY_LIMIT,
  SHUFFLE_DEFAULTS,
  type ShuffleHistoryItem,
  type ShuffleMode,
  type ShuffleState,
} from '../constants/shuffle';
import type { ShuffleStore } from './shuffle.types';
import { genId, schedulePersist, STATE_FILE } from './shuffle.persistence';

/**
 * Auto-shuffle store + persistence.
 *
 * Persistence uses `expo-file-system/legacy` (already a project dep, no
 * native rebuild). State is written to a single JSON file in cacheDirectory;
 * AsyncStorage would need a fresh native build and was rejected for Phase 1
 * — see changes/021. The state-file path + debounced writer now live in
 * `shuffle.persistence.ts`; the action/store types in `shuffle.types.ts`.
 *
 * The store boots in an `unhydrated` state. The first component that mounts
 * calls `hydrateShuffleStore()`, which reads the file off-thread and merges
 * defaults. Writes are debounced (250 ms) so a flurry of mutations (e.g. the
 * 10-image picker tapping rapidly) coalesces into one fs write.
 */

// Stable promise so multiple parallel callers (cold-launch bg task + UI mount
// + notification handler) all await the SAME hydrate, not three concurrent
// reads of the same file.
let hydratePromise: Promise<void> | null = null;

/** Idempotent boot helper. Safe from anywhere, awaitable. */
export const hydrateShuffleStore = (): Promise<void> => {
  if (useShuffleStore.getState().hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = useShuffleStore
      .getState()
      .hydrate()
      .finally(() => {
        hydratePromise = null;
      });
  }
  return hydratePromise;
};

export const useShuffleStore = create<ShuffleStore>((set, get) => ({
  ...SHUFFLE_DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const info = await FileSystem.getInfoAsync(STATE_FILE);
      if (info.exists) {
        const raw = await FileSystem.readAsStringAsync(STATE_FILE);
        const parsed = JSON.parse(raw) as Partial<ShuffleState>;
        set({
          ...SHUFFLE_DEFAULTS,
          ...parsed,
          hydrated: true,
        });
        return;
      }
    } catch (e) {
      console.warn('[shuffle] hydrate failed; using defaults:', e);
    }
    set({ hydrated: true });
  },

  createCollection: (name, purpose = 'shuffle') => {
    const c: Collection = {
      id: genId(),
      name: name.trim() || `Collection ${get().collections.length + 1}`,
      photoIds: [],
      timerId: '60m',
      mode: 'sequential',
      createdAt: Date.now(),
      purpose,
    };
    const next = { ...get(), collections: [...get().collections, c] };
    set({ collections: next.collections });
    schedulePersist(next);
    return c;
  },

  updateCollection: (id, patch) => {
    const collections = get().collections.map((c) =>
      c.id === id
        ? {
            ...c,
            ...patch,
            // Enforce the 10-image cap even if a caller slips through.
            photoIds: patch.photoIds
              ? patch.photoIds.slice(0, COLLECTION_SIZE)
              : c.photoIds,
          }
        : c,
    );
    set({ collections });
    schedulePersist({ ...get(), collections });
  },

  deleteCollection: (id) => {
    const collections = get().collections.filter((c) => c.id !== id);
    const activeCollectionId =
      get().activeCollectionId === id ? null : get().activeCollectionId;
    const history = get().history.filter((h) => h.collectionId !== id);
    set({ collections, activeCollectionId, history, currentIndex: 0 });
    schedulePersist({ ...get(), collections, activeCollectionId, history });
  },

  setActive: (id) => {
    // Activating a different collection resets the rotation pointer.
    const reset = id !== get().activeCollectionId;
    const next = {
      activeCollectionId: id,
      currentIndex: reset ? 0 : get().currentIndex,
      // Pausing should not block a fresh activation.
      paused: false,
      lastChangedAt: reset ? null : get().lastChangedAt,
    };
    set(next);
    schedulePersist({ ...get(), ...next });
  },

  setPaused: (paused) => {
    set({ paused });
    schedulePersist({ ...get(), paused });
  },

  setDnd: (dndStart, dndEnd) => {
    set({ dndStart, dndEnd });
    schedulePersist({ ...get(), dndStart, dndEnd });
  },

  recordChange: (item, nextIndex) => {
    const history = [item, ...get().history].slice(0, HISTORY_LIMIT);
    const patch = {
      history,
      currentIndex: nextIndex,
      lastChangedAt: item.at,
    };
    set(patch);
    schedulePersist({ ...get(), ...patch });
  },

  clearHistory: () => {
    set({ history: [] });
    schedulePersist({ ...get(), history: [] });
  },

  countCollections: () => get().collections.length,

  // Only user-built collections (seedPackId == null) count against the free
  // limit. The user can activate any number of built-in theme packs. The
  // limit is now PER PURPOSE — Shuffle and Mood are independent so a free
  // user can have one of each without paying.
  canAddCollection: (isPremium, purpose = 'shuffle') =>
    isPremium ||
    get().collections.filter(
      (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === purpose,
    ).length < FREE_COLLECTION_LIMIT,

  ensureBuiltinPackCollection: (seedPackId, name, photoIds) => {
    const existing = get().collections.find((c) => c.seedPackId === seedPackId);
    if (existing) return existing.id;
    const c: Collection = {
      id: genId(),
      name,
      photoIds: photoIds.slice(0, COLLECTION_SIZE),
      timerId: '60m',
      mode: 'sequential',
      createdAt: Date.now(),
      seedPackId,
    };
    const collections = [...get().collections, c];
    set({ collections });
    schedulePersist({ ...get(), collections });
    return c.id;
  },

  activateBuiltinPack: (seedPackId, name, photoIds) => {
    const existing = get().collections.find((c) => c.seedPackId === seedPackId);
    if (existing) {
      // Re-seed photos in case the source pack changed (e.g. mockData edit).
      // Keep the user's custom timer/mode picks on the second activation.
      const collections = get().collections.map((c) =>
        c.id === existing.id
          ? { ...c, photoIds: photoIds.slice(0, COLLECTION_SIZE) }
          : c,
      );
      set({
        collections,
        activeCollectionId: existing.id,
        currentIndex: 0,
        paused: false,
        lastChangedAt: null,
      });
      schedulePersist({
        ...get(),
        collections,
        activeCollectionId: existing.id,
      });
      return existing.id;
    }
    const c: Collection = {
      id: genId(),
      name,
      photoIds: photoIds.slice(0, COLLECTION_SIZE),
      timerId: '60m',
      mode: 'sequential',
      createdAt: Date.now(),
      seedPackId,
    };
    const collections = [...get().collections, c];
    set({
      collections,
      activeCollectionId: c.id,
      currentIndex: 0,
      paused: false,
      lastChangedAt: null,
    });
    schedulePersist({ ...get(), collections, activeCollectionId: c.id });
    return c.id;
  },
}));

// --- Convenience selectors ---

/** Re-renders only when the collection list changes. */
export const useCollections = () => useShuffleStore((s) => s.collections);

/** Re-renders only when the active id changes. */
export const useActiveCollectionId = () =>
  useShuffleStore((s) => s.activeCollectionId);

export const useActiveCollection = (): Collection | null => {
  const id = useActiveCollectionId();
  const collections = useCollections();
  return id ? collections.find((c) => c.id === id) ?? null : null;
};

/** Pulls a specific collection out by id. Use this in the detail screen. */
export const useCollectionById = (id: string | undefined): Collection | null =>
  useShuffleStore((s) =>
    id ? s.collections.find((c) => c.id === id) ?? null : null,
  );

export type { Collection, ShuffleHistoryItem, ShuffleMode };
