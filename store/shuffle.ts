import * as FileSystem from 'expo-file-system/legacy';
import { create } from 'zustand';
import {
  type Collection,
  type CollectionPurpose,
  COLLECTION_SIZE,
  FREE_COLLECTION_LIMIT,
  HISTORY_LIMIT,
  SHUFFLE_DEFAULTS,
  type ShuffleHistoryItem,
  type ShuffleMode,
  type ShuffleState,
} from '../constants/shuffle';

/**
 * Auto-shuffle store + persistence.
 *
 * Persistence uses `expo-file-system/legacy` (already a project dep, no
 * native rebuild). State is written to a single JSON file in cacheDirectory;
 * AsyncStorage would need a fresh native build and was rejected for Phase 1
 * — see changes/021.
 *
 * The store boots in an `unhydrated` state. The first component that mounts
 * calls `hydrateShuffleStore()`, which reads the file off-thread and merges
 * defaults. Writes are debounced (250 ms) so a flurry of mutations (e.g. the
 * 10-image picker tapping rapidly) coalesces into one fs write.
 */

type Actions = {
  /** True once `hydrate()` has resolved. UI can show a tiny spinner until then. */
  hydrated: boolean;
  hydrate: () => Promise<void>;

  createCollection: (name: string, purpose?: CollectionPurpose) => Collection;
  updateCollection: (id: string, patch: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  setActive: (id: string | null) => void;

  setPaused: (paused: boolean) => void;
  setDnd: (start: string | null, end: string | null) => void;

  /** Move to the explicit `nextIndex` and append history. Engine-owned. */
  recordChange: (item: ShuffleHistoryItem, nextIndex: number) => void;
  /** Reset history (e.g. on collection delete). */
  clearHistory: () => void;

  /** Number of collections that count against the free-tier limit. */
  countCollections: () => number;
  /** Free tier may build ONE custom collection PER PURPOSE — Shuffle and
   *  Mood are independent slots so the user can have both without
   *  upgrading. Built-in packs are always exempt (see `seedPackId`). */
  canAddCollection: (isPremium: boolean, purpose?: CollectionPurpose) => boolean;

  /**
   * Upsert-and-activate a built-in theme pack. If a collection already exists
   * with this `seedPackId`, just flip the active id; otherwise create one and
   * activate it. Always exempt from the free-tier limit (see seedPackId
   * docs on `Collection`).
   *
   * Returns the (possibly newly-created) collection id.
   */
  activateBuiltinPack: (
    seedPackId: string,
    name: string,
    photoIds: string[],
  ) => string;

  /**
   * Get-or-create the Collection backing a built-in pack WITHOUT activating
   * it. Used by the "configure before shuffling" path so the user can open
   * the edit screen (set timer/mode) without immediately starting a
   * wallpaper change. Returns the collection id.
   */
  ensureBuiltinPackCollection: (
    seedPackId: string,
    name: string,
    photoIds: string[],
  ) => string;
};

type ShuffleStore = ShuffleState & Actions;

const STATE_FILE = `${FileSystem.cacheDirectory ?? ''}shuffle-state.json`;

// Debounced JSON writer. Captures the latest state on every mutation; only
// the most recent call wins. Fire-and-forget — failures log to console; the
// in-memory state is the source of truth for the live session.
let writeTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(state: ShuffleState) {
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

function genId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

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
