import { create } from 'zustand';

export type SettingsState = {
  // Account
  theme: string;
  autoDownload: boolean;
  saveToGallery: boolean;
  // Wallpaper
  resolution: string;
  liveWallpaper: boolean;
  showSetButton: boolean;
  // Wallpaper Management
  /** Route Save-to-Gallery into a dedicated "Kawaii Baby" album. */
  featuredFolder: boolean;
  // AI Generator
  generateQuality: string;
  autoSaveGenerated: boolean;
  maxGenPerDay: number;
  // Notifications
  newWallpaperAlerts: boolean;
  dailyRecommendation: boolean;
  vibrationOnDownload: boolean;
  // Onboarding — has the user been shown the one-time "allow always-on
  // background" prompt yet? Set true the first time any background
  // feature (shuffle / mood / friend / sleep-wake) is enabled, so we
  // deep-link them to the battery/autostart setting exactly once and
  // never nag again. See `lib/backgroundAccess.ts`.
  bgAccessPrompted: boolean;
  // Monetization — stub flag standing in for a RevenueCat `premium`
  // entitlement until purchases are wired (changes/021). Flipping this
  // unlocks the premium tier locally for testing. Phase 2 swaps the
  // selector to `useCustomerInfo()?.entitlements.active.premium != null`.
  isPremium: boolean;
  // Couple Premium — separate SKU from the main premium. Gates the
  // generate-couple-code action on the Couple page (changes/077). Set
  // to TRUE either:
  //   1. The user purchases Couple Premium directly (phase 2 — wire to
  //      RevenueCat entitlement `couple_premium`).
  //   2. The user accepts a partner's valid LOVE-XXXX code via
  //      `accept_couple_code` — `lib/couple.ts:acceptCode` flips this
  //      to true on success so the partner inherits the perk.
  // Once true, it stays true even after unlinking (the user paid for /
  // earned the perk; we don't revoke it on un-pair).
  isCouplePremium: boolean;
};

type SettingsStore = SettingsState & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
};

/** Defaults mirror the design spec (Auto Download OFF, Save to Gallery ON, etc.). */
const DEFAULTS: SettingsState = {
  theme: 'Kawaii Dark',
  autoDownload: false,
  saveToGallery: true,
  resolution: '4K',
  liveWallpaper: false,
  showSetButton: true,
  featuredFolder: false,
  generateQuality: 'High Quality',
  autoSaveGenerated: true,
  maxGenPerDay: 50,
  newWallpaperAlerts: true,
  dailyRecommendation: true,
  vibrationOnDownload: false,
  bgAccessPrompted: false,
  isPremium: false,
  isCouplePremium: false,
};

// ─── Persistence ──────────────────────────────────────────────────────────
// Mirrors the lazy-require pattern used in `lib/moodHistory.ts` so the
// store still works if the AsyncStorage native bridge isn't linked yet
// (pre-rebuild dev session). Writes are fire-and-forget; the in-memory
// state is the source of truth for the live session.
//
// The bug that drove this: `isPremium` was previously in-memory only, so
// every cold launch reset it to false. The mood background-task fallback
// (lib/moodBackgroundTask.ts) gates on `isPremium`, so the silent Sleep/Wake
// auto-apply + context-mood auto-change stopped firing after any app
// restart — even though the FEATURE toggles (sleepWakeEnabled,
// backgroundEnabled, …) WERE persisted in the mood store. The user saw
// notifications fire but no automatic wallpaper change.

const PERSIST_KEY = '@kawaii/settings@v1';

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
function schedulePersist(state: SettingsState) {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const s = getStorage();
    if (!s) return;
    s.setItem(PERSIST_KEY, JSON.stringify(state)).catch(() => {
      /* swallow — in-memory state is authoritative for the session */
    });
  }, 200);
}

/**
 * Settings store. `hydrate()` is idempotent and should be awaited from app
 * bootstrap BEFORE the bg-task / notification handlers run (otherwise they
 * see `isPremium: false` while AsyncStorage is still being read).
 */
export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...DEFAULTS,
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
        const parsed = JSON.parse(raw) as Partial<SettingsState>;
        // CORE-8: layer persisted values UNDER any keys the user changed in
        // the window before this async read resolved (early changes win, as
        // the most recent intent), instead of overwriting wholesale and
        // dropping that action. `earlyChanges` is the diff of the live state
        // against DEFAULTS.
        const earlyChanges = diffFromDefaults(get());
        const merged = { ...DEFAULTS, ...parsed, ...earlyChanges };
        set({ ...merged, hydrated: true });
        // If an early change deviated from what's on disk, persist the merge.
        if (Object.keys(earlyChanges).length) schedulePersist(merged);
        return;
      }
    } catch {
      /* fall through — use defaults */
    }
    set({ hydrated: true });
    // Flush any pre-hydration change that the gated `set` skipped writing.
    const earlyChanges = diffFromDefaults(get());
    if (Object.keys(earlyChanges).length) schedulePersist(stripStoreFields(get()));
  },
  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    // CORE-8: only persist once hydrated, so a user action before hydrate()
    // resolves can't write a default-laden snapshot that lands after the
    // async read and clobbers the persisted value. The in-memory update
    // applies immediately; hydrate() merges + flushes it.
    if (get().hydrated) schedulePersist(stripStoreFields(get()));
  },
}));

/** The persisted SettingsState keys (everything except the store-only fields). */
function stripStoreFields(state: SettingsStore): SettingsState {
  const { hydrated: _hydrated, hydrate: _hydrate, set: _set, ...rest } = state;
  return rest;
}

/** Keys whose live value differs from the default — i.e. user changed them. */
function diffFromDefaults(state: SettingsStore): Partial<SettingsState> {
  const out: Partial<SettingsState> = {};
  const live = stripStoreFields(state);
  (Object.keys(DEFAULTS) as (keyof SettingsState)[]).forEach((k) => {
    if (live[k] !== DEFAULTS[k]) {
      (out as Record<string, unknown>)[k] = live[k];
    }
  });
  return out;
}

export const hydrateSettingsStore = () => useSettingsStore.getState().hydrate();
