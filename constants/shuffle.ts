/**
 * Auto-shuffle types + catalogs.
 *
 * Phase 1 (changes/021): UI + storage only. The shuffle engine is foreground-
 * only (hooks/useShuffleEngine.ts ticks while the Active screen is mounted).
 * Phase 2 will wire `react-native-background-fetch` and Android WorkManager so
 * the engine survives app close + reboot. The data model below is already the
 * shape Phase 2 will read — no migration needed.
 */

import type { Ionicons } from '@expo/vector-icons';

/** How many wallpapers each collection holds. Fixed by spec. */
export const COLLECTION_SIZE = 10;

/** Free tier may only have ONE collection at a time. Premium has unlimited. */
export const FREE_COLLECTION_LIMIT = 1;

/** History cap — only the last N changes are retained. */
export const HISTORY_LIMIT = 30;

/** Below this battery %, the engine skips a tick. */
export const BATTERY_FLOOR = 15;

export type ShuffleMode =
  /** Sequential through the 10 images, image 1 → 10 → 1. */
  | 'sequential'
  /** Pure random — picks any of the 10 each tick (no immediate repeat). */
  | 'random'
  /** Bright images during the day (06:00–18:00), dark at night. PREMIUM. */
  | 'smart'
  /** A different image for each weekday (Mon → image 1, etc.). */
  | 'day';

export type ShuffleModeDef = {
  id: ShuffleMode;
  label: string;
  caption: string;
  icon: keyof typeof Ionicons.glyphMap;
  premium: boolean;
};

export const SHUFFLE_MODES: ShuffleModeDef[] = [
  { id: 'sequential', label: 'Sequential',  caption: 'In order, 1 → 10',     icon: 'list',          premium: false },
  { id: 'random',     label: 'Random',      caption: 'Shuffle freely',       icon: 'shuffle',       premium: false },
  { id: 'day',        label: 'Day-based',   caption: 'One per weekday',      icon: 'calendar',      premium: false },
  { id: 'smart',      label: 'Smart time',  caption: 'Bright by day, dark by night', icon: 'sunny', premium: true  },
];

export type TimerOption = {
  /** Stable id used in storage; also the human label fallback. */
  id: string;
  /** Display label. */
  label: string;
  /** Minutes per tick. `null` = custom, value lives on the collection. */
  minutes: number | null;
  premium: boolean;
};

export const TIMER_OPTIONS: TimerOption[] = [
  // Free tier
  { id: '60m',   label: '1 hour',   minutes: 60,   premium: false },
  { id: '6h',    label: '6 hours',  minutes: 360,  premium: false },
  { id: '12h',   label: '12 hours', minutes: 720,  premium: false },
  { id: '24h',   label: '24 hours', minutes: 1440, premium: false },
  // Premium tier
  { id: '15m',   label: '15 min',   minutes: 15,   premium: true },
  { id: '30m',   label: '30 min',   minutes: 30,   premium: true },
  { id: 'custom',label: 'Custom',   minutes: null, premium: true },
];

/** What surface a user-built collection is for. Theme Pack hub shows
 *  'shuffle' rows; the Mood pool picker shows 'mood' rows. The two surfaces
 *  no longer share a single user pool — creating one in either surface does
 *  NOT leak into the other. Built-in seeded packs (with `seedPackId`)
 *  ignore this field and surface in BOTH places — curated packs can drive
 *  either feature. */
export type CollectionPurpose = 'shuffle' | 'mood';

export type Collection = {
  id: string;
  name: string;
  /** Image ids from `searchCatalog` (resolved via `getPhotoById`). */
  photoIds: string[];
  /** Selected timer option. `customMinutes` is used iff timerId === 'custom'. */
  timerId: string;
  customMinutes?: number;
  mode: ShuffleMode;
  createdAt: number;
  /**
   * If set, this collection was seeded from a built-in theme pack (see
   * `themePacks` in mockData). Built-in collections do NOT count against
   * the free-tier `FREE_COLLECTION_LIMIT` so a free user can shuffle any
   * of the ready-made packs without burning their custom slot.
   */
  seedPackId?: string;
  /** See `CollectionPurpose`. Missing → treated as 'shuffle' (back-compat
   *  for the pre-purpose-field user collections persisted on disk). */
  purpose?: CollectionPurpose;
};

export type ShuffleHistoryItem = {
  /** Photo id that was applied. */
  photoId: string;
  /** Image URL applied (denormalized so history survives mockData changes). */
  image: string;
  /** ms epoch when the change was made. */
  at: number;
  /** Which collection drove this change. */
  collectionId: string;
};

export type ShuffleState = {
  collections: Collection[];
  activeCollectionId: string | null;
  currentIndex: number;
  history: ShuffleHistoryItem[];
  paused: boolean;
  /** Do-Not-Disturb window, HH:MM 24h. Both null = disabled. */
  dndStart: string | null;
  dndEnd: string | null;
  /** ms epoch of the last successful change — drives countdown math. */
  lastChangedAt: number | null;
};

export const SHUFFLE_DEFAULTS: ShuffleState = {
  collections: [],
  activeCollectionId: null,
  currentIndex: 0,
  history: [],
  paused: false,
  dndStart: null,
  dndEnd: null,
  lastChangedAt: null,
};

/**
 * Resolve the active timer's minute count for a collection. Falls back to
 * 60 min if a stored timerId is unknown (e.g. an old build). `customMinutes`
 * is clamped to a sane range.
 */
export function getCollectionIntervalMinutes(c: Collection): number {
  const opt = TIMER_OPTIONS.find((t) => t.id === c.timerId);
  if (!opt) return 60;
  if (opt.minutes != null) return opt.minutes;
  const custom = c.customMinutes ?? 60;
  return Math.min(Math.max(custom, 5), 24 * 60);
}

/**
 * Midnight (local time) of the calendar day AFTER `from`.
 *
 * Day-based mode rotates on this boundary instead of on the generic timer
 * interval. Before this, Day-based picked an image purely from the weekday
 * (`getDay()`) but still ticked on the "Shuffle every" timer — so every tick
 * within the same day re-applied the SAME image and the wallpaper looked
 * frozen (and a 24h timer meant no change for a whole day). Rotating at
 * midnight makes "one new wallpaper per day" actually behave that way.
 */
export function nextLocalMidnight(from: number = Date.now()): number {
  const d = new Date(from);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + 1,
    0, 0, 0, 0,
  ).getTime();
}

/**
 * When the active collection is next due to change. Day-based fires at the
 * next local midnight; every other mode fires one timer-interval after the
 * last change. Single source of truth shared by the foreground ticker, the
 * background single-shot, and the on-screen countdown so all three agree.
 */
export function getNextChangeAt(c: Collection, lastChangedAt: number): number {
  if (c.mode === 'day') return nextLocalMidnight(lastChangedAt);
  return lastChangedAt + getCollectionIntervalMinutes(c) * 60_000;
}

/** "Mon" / "Tue" etc. — index 0 = Sunday per JS Date semantics. */
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** True if `HH:MM` `now` falls inside the [start, end] DND window. */
export function isInDnd(
  nowMins: number,
  startMin: number,
  endMin: number,
): boolean {
  // Window wraps midnight (e.g. 22:00 → 07:00).
  if (endMin < startMin) {
    return nowMins >= startMin || nowMins < endMin;
  }
  return nowMins >= startMin && nowMins < endMin;
}

export function parseHHMM(s: string): number | null {
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}
