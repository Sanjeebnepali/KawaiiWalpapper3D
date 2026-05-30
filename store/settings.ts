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
  // NOTE: the old `maxGenPerDay` field was removed (AI-M2). It was dead
  // state — the real free-tier cap is `FREE_DAILY_LIMIT` in
  // `lib/ai/client.ts`, enforced via the persisted `dailyGen` counter in
  // `store/ai.ts`. Nothing read `maxGenPerDay`, so it only misled the docs
  // into claiming a 50/day cap that never applied.
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
  // Same idea for the Android 12+ "Alarms & reminders" (exact-alarm) grant —
  // a SEPARATE one-time prompt that gives to-the-minute timing. Tracked apart
  // from `bgAccessPrompted` so the two prompts can be shown in different
  // sessions (never stacked) and each is offered exactly once.
  exactAlarmPrompted: boolean;
  // ─── Entitlements (à la carte premium — changes/158) ────────────────────
  // The app sells FOUR independently-purchasable premium areas plus an
  // "All Access" bundle that grants all four at once. Every premium gate
  // checks `allAccess || <the area's flag>` via `lib/billing.ts`
  // (`hasEntitlement` / `useEntitlement`). These flags are written by the
  // subscription page's mock purchase (`purchasePlans`) and persist across
  // restarts. Real billing (RevenueCat) swaps the WRITE path only — the
  // read path (these flags) and every call site stay the same.
  //
  // Replaces the old single `isPremium` flag; the v2→v3 migration below maps
  // a pre-existing `isPremium: true` onto the three non-couple areas.
  allAccess: boolean; // bundle — grants all four areas at once
  entThemePacks: boolean; // custom albums + 15/30/custom timers + smart shuffle
  entMood: boolean; // all mood-based features
  entCollection: boolean; // the 60-image premium wallpaper collection
  // Couple Theme is its own SKU. `isCouplePremium` keeps its name (many call
  // sites + `lib/couple` write it). `coupleSource` records WHY the user holds
  // it, which drives the unlink rule (the buyer keeps it; a partner who only
  // entered the buyer's code is re-locked when the pair ends):
  //   'purchased' → bought directly OR via All Access → KEPT after unlink.
  //   'inherited' → unlocked by entering a partner's code → REVOKED on unlink.
  //   null        → not entitled.
  // Enforced in `lib/billing.ts:reconcileCoupleEntitlement`.
  isCouplePremium: boolean;
  coupleSource: 'purchased' | 'inherited' | null;
  // Billing cadence the user last chose on the subscription page. Display
  // only for the mock; real billing tracks the period per-SKU.
  billingPeriod: 'monthly' | 'yearly';
};

type SettingsStore = SettingsState & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
};

/**
 * Defaults. Both gallery-save toggles default OFF so applying a wallpaper
 * never copies it to the device gallery unless the user explicitly opts in
 * (Auto Download or Save to Gallery). The manual "Save to Gallery" action in
 * the wallpaper menu always works regardless of these toggles. `saveToGallery`
 * was previously ON by default, which silently saved every applied wallpaper —
 * see the v1→v2 migration in `applyMigrations` for the existing-install reset.
 */
const DEFAULTS: SettingsState = {
  theme: 'Kawaii Dark',
  autoDownload: false,
  saveToGallery: false,
  resolution: '4K',
  liveWallpaper: false,
  showSetButton: true,
  featuredFolder: false,
  generateQuality: 'High Quality',
  autoSaveGenerated: true,
  newWallpaperAlerts: true,
  dailyRecommendation: true,
  vibrationOnDownload: false,
  bgAccessPrompted: false,
  exactAlarmPrompted: false,
  allAccess: false,
  entThemePacks: false,
  entMood: false,
  entCollection: false,
  isCouplePremium: false,
  coupleSource: null,
  billingPeriod: 'monthly',
};

// ─── Persistence ──────────────────────────────────────────────────────────
// Mirrors the lazy-require pattern used in `lib/moodHistory.ts` so the
// store still works if the AsyncStorage native bridge isn't linked yet
// (pre-rebuild dev session). Writes are fire-and-forget; the in-memory
// state is the source of truth for the live session.
//
// The bug that drove this: the premium entitlement was previously in-memory
// only, so every cold launch reset it to false. The mood background-task
// fallback (lib/moodBackgroundTask.ts) gates on the mood entitlement, so the
// silent Sleep/Wake auto-apply + context-mood auto-change stopped firing after
// any app restart — even though the FEATURE toggles (sleepWakeEnabled,
// backgroundEnabled, …) WERE persisted in the mood store. The user saw
// notifications fire but no automatic wallpaper change.

const PERSIST_KEY = '@kawaii/settings@v1';
// Schema version tracked separately from the settings blob so migrations can
// run without resetting the user's whole settings object (bumping PERSIST_KEY
// would wipe theme/toggles too). Stored as a plain integer string.
const SCHEMA_KEY = '@kawaii/settings/schema';
const SCHEMA_VERSION = 3;

type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
};

/**
 * One-time, forward-only migrations applied to the persisted settings blob
 * before it's merged into the live store. Returns the (possibly adjusted)
 * settings plus whether anything changed, so `hydrate` can re-persist the
 * corrected blob (otherwise the next launch would re-read the stale value
 * and, since the schema version is already bumped, skip the fix).
 *
 *   v1 → v2: `saveToGallery` ("Always save") used to default ON, which
 *   auto-saved every applied wallpaper to the gallery without the user ever
 *   opting in. The new default is OFF (opt-in). Reset the inherited-on value
 *   exactly once so existing installs match the new behaviour. A user who
 *   genuinely wants it can re-enable it; the migration won't run again.
 *
 *   v2 → v3: the single `isPremium` flag was split into the four à la carte
 *   entitlements (changes/158). Map a pre-existing `isPremium: true` onto the
 *   three non-couple areas, and treat any held `isCouplePremium` as a real
 *   purchase ('purchased' source) so upgrading testers aren't downgraded /
 *   re-locked on their next unlink.
 */
async function applyMigrations(
  s: AsyncStorageLike,
  parsed: Partial<SettingsState>,
): Promise<{ data: Partial<SettingsState>; didMigrate: boolean }> {
  let version = 1;
  try {
    const v = await s.getItem(SCHEMA_KEY);
    if (v) version = parseInt(v, 10) || 1;
  } catch {
    /* assume v1 — safe to re-run a forward-only migration once */
  }
  if (version >= SCHEMA_VERSION) return { data: parsed, didMigrate: false };

  const data: Partial<SettingsState> = { ...parsed };
  if (version < 2 && data.saveToGallery === true) {
    data.saveToGallery = false;
  }
  if (version < 3) {
    // `isPremium` is no longer a field — read it off the legacy blob.
    const legacy = data as Partial<SettingsState> & { isPremium?: boolean };
    if (legacy.isPremium === true) {
      data.entThemePacks = true;
      data.entMood = true;
      data.entCollection = true;
    }
    if (legacy.isCouplePremium === true && data.coupleSource == null) {
      data.coupleSource = 'purchased';
    }
    delete legacy.isPremium;
  }
  try {
    await s.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
  } catch {
    /* best effort — worst case the migration re-runs next launch (idempotent) */
  }
  return { data, didMigrate: true };
}

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
 * see the entitlement flags as false while AsyncStorage is still being read).
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
        // Run forward-only schema migrations on the persisted blob before it
        // reaches the live store (e.g. v1→v2 resets the old default-ON
        // saveToGallery to opt-in).
        const { data: migratedParsed, didMigrate } = await applyMigrations(
          s,
          parsed,
        );
        // CORE-8: layer persisted values UNDER any keys the user changed in
        // the window before this async read resolved (early changes win, as
        // the most recent intent), instead of overwriting wholesale and
        // dropping that action. `earlyChanges` is the diff of the live state
        // against DEFAULTS.
        const earlyChanges = diffFromDefaults(get());
        const merged = { ...DEFAULTS, ...migratedParsed, ...earlyChanges };
        set({ ...merged, hydrated: true });
        // Persist the merge if an early change deviated from disk OR a
        // migration adjusted a value — without the latter, the next launch
        // would re-read the stale blob and (schema already bumped) skip the
        // fix, reverting the migration.
        if (didMigrate || Object.keys(earlyChanges).length) {
          schedulePersist(merged);
        }
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
