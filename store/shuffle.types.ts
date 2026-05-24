/**
 * Action + store types for `store/shuffle.ts`. The persisted state shape
 * (`ShuffleState`, `Collection`, …) lives in `constants/shuffle.ts`; this
 * file is just the actions surface composed onto it.
 */
import {
  type Collection,
  type CollectionPurpose,
  type ShuffleHistoryItem,
  type ShuffleState,
} from '../constants/shuffle';

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

export type ShuffleStore = ShuffleState & Actions;
