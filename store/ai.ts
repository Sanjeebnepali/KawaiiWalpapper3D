/**
 * AI image-generation state.
 *
 * Holds:
 *   - API token (Hugging Face for now) — user enters once in Settings,
 *     persisted to AsyncStorage. Future paid providers can each get
 *     their own token field (`dalleToken`, `stabilityToken`, …).
 *   - Active provider id + model id — what the next `generateImage`
 *     call will use.
 *   - Generation history — last N results (local URI + prompt + model),
 *     so the AI screen can show a "your recent generations" strip.
 *   - Daily quota counter (per-provider) — defends against runaway
 *     bills if a paid provider is wired up later.
 *
 * Why a separate store instead of folding into `store/settings.ts`:
 *   - History is mutable and grows; keeping it isolated avoids
 *     bloating the settings hydrate / write cycle.
 *   - Tokens are sensitive — separate persistence key makes a future
 *     "wipe AI data" flow a one-call operation.
 *   - Matches the existing pattern (`mood.ts`, `shuffle.ts`,
 *     `favorites.ts`).
 */

import { create } from 'zustand';
import type { AIProviderId } from '../lib/ai/types';

export const HISTORY_LIMIT = 30;

export type AIGeneration = {
  /** Local `file://` URI of the generated image in cacheDirectory. */
  localUri: string;
  /** The prompt that produced this image — surfaced in the preview
   *  and the "recent generations" strip. */
  prompt: string;
  /** Provider id that served the request. */
  provider: AIProviderId;
  /** Model id (e.g. `'black-forest-labs/FLUX.1-schnell'`). */
  model: string;
  /** Unix ms — used for sorting + the per-day quota counter. */
  createdAt: number;
  width?: number;
  height?: number;
  /** Wall-clock duration of the generation request (ms). Persisted so a
   *  re-opened generation from the recent strip can still show its
   *  timing in the preview subtitle (previously forced to `'0'`). */
  durationMs?: number;
};

export type AIState = {
  /** Hugging Face Inference API token. `hf_…` prefix. Empty string
   *  means "user hasn't pasted one yet" — the AI screen prompts them
   *  to do so via the Settings row. */
  hfToken: string;
  /** Optional free Pollinations token (auth.pollinations.ai). Empty =
   *  the anonymous tier (1 image / 15 s). A token moves the user to the
   *  free "seed" tier (1 image / 5 s). Anonymous works without it — this
   *  is purely a speed upgrade for the free default provider. */
  pollToken: string;
  /** OpenAI API key (DALL·E provider). Empty = not configured. The user's
   *  own key → unlimited generation, billed to their OpenAI account. */
  openaiToken: string;
  /** Google API key (Gemini/Imagen provider). Empty = not configured. */
  geminiToken: string;
  /** Selected HF model id. Falls back to provider default if empty. */
  hfModelId: string;
  /** Active provider id — controls which provider `client.generateImage`
   *  dispatches to. */
  providerId: AIProviderId;
  /** Most-recent-first list of generations. Capped at `HISTORY_LIMIT`. */
  history: AIGeneration[];
  /**
   * Daily free-tier quota counter, DECOUPLED from `history` (AI-M1). The
   * count used to be derived from `history` via `todayCount()`, which let
   * "Clear AI history" reset the quota to 0 — a trivial free-limit bypass.
   * This standalone counter is incremented on every SUCCESSFUL generation
   * and is NOT touched by `clearHistory`/`removeGeneration`, so deleting
   * history can't refill the allowance. It resets when `dayKey` rolls over
   * to a new local day, and is wiped by `resetAll` (a real sign-out, so a
   * new user on a shared device gets a fresh allowance — that's correct).
   */
  dailyGen: { dayKey: string; count: number };
};

type AIStore = AIState & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setHFToken: (t: string) => void;
  setPollToken: (t: string) => void;
  setOpenAIToken: (t: string) => void;
  setGeminiToken: (t: string) => void;
  setHFModelId: (id: string) => void;
  setProviderId: (id: AIProviderId) => void;
  recordGeneration: (g: AIGeneration) => void;
  /** Remove a single generation by its `localUri`. Only updates the
   *  store — the cache file is deleted separately by
   *  `lib/ai/client.ts:deleteGeneration` so the store stays pure
   *  (no FileSystem imports here). Safe to call with a URI that
   *  doesn't match anything in history — it's a no-op then. */
  removeGeneration: (localUri: string) => void;
  /** Clear history (UI: Settings → "Clear AI history"). */
  clearHistory: () => void;
  /**
   * Reset the in-memory AI state to defaults — clears the generation
   * history and resets provider/tokens back to `DEFAULTS`. Synchronous
   * and side-effect-free (no AsyncStorage touch), so the Core team's
   * sign-out flow can call it inline without awaiting. The persisted
   * blob is left alone here; use `resetAll` when the disk copy must go
   * too. Idempotent.
   */
  reset: () => void;
  /**
   * Wipe ALL AI state from memory AND disk — tokens, provider, history,
   * AND the daily free-tier quota counter (`dailyGen`). Used by the
   * Settings "scrub the app" button and by the auth sign-out flow on a
   * shared device, so the next user inherits NO tokens, NO history, and
   * NO consumed quota (gets a fresh allowance). Idempotent.
   */
  resetAll: () => Promise<void>;
  /** Number of generations recorded today (local day). Returns the
   *  history-independent `dailyGen` counter when it's for today, so the
   *  UI label stays in lock-step with the actual free-tier gate and
   *  clearing history can't make it under-report (AI-M1). */
  todayCount: () => number;
  /** Increment the persisted daily free-tier counter by one, rolling it
   *  over to the current local day first if `dayKey` changed. Called on a
   *  SUCCESSFUL generation only (see `lib/ai/client.ts`). Decoupled from
   *  history so `clearHistory` can't reset the quota. */
  bumpDailyGen: () => void;
};

const DEFAULTS: AIState = {
  hfToken: '',
  pollToken: '',
  openaiToken: '',
  geminiToken: '',
  hfModelId: '',
  // Pollinations (no token, no setup) is the new default per change 068.
  // Existing installs that have `providerId: 'huggingface'` persisted
  // KEEP that — the hydrate path doesn't overwrite. To force everyone
  // back to the new default we'd need a one-shot migration; for now
  // any user still on the broken HF path can switch via Settings.
  providerId: 'pollinations',
  history: [],
  // Empty dayKey => "no generations recorded yet today"; the first
  // successful gen on any given local day seeds it.
  dailyGen: { dayKey: '', count: 0 },
};

// ─── Persistence (mirrors store/settings.ts) ─────────────────────────────

const PERSIST_KEY = '@kawaii/ai@v1';

type AsyncStorageLike = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
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
function schedulePersist(state: AIState) {
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
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const useAIStore = create<AIStore>((set, get) => ({
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
        const parsed = JSON.parse(raw) as Partial<AIState>;
        // Migration shipped in change 068: HF's free tier was killed
        // off by their Inference Providers paywall. Anyone whose
        // persisted state still has `providerId: 'huggingface'` AND
        // no user-supplied `hfToken` (so they're relying on the
        // embedded default which is now provably unusable) gets
        // silently switched to Pollinations — the new free default.
        // Users who DID paste their own HF token keep their choice
        // (their token may have inference-providers credit attached).
        const migrated: Partial<AIState> = { ...parsed };
        if (
          parsed.providerId === 'huggingface' &&
          (!parsed.hfToken || parsed.hfToken.length === 0)
        ) {
          migrated.providerId = 'pollinations';
        }
        set({ ...DEFAULTS, ...migrated, hydrated: true });
        // Persist the migration so the next launch doesn't re-do it.
        if (migrated.providerId !== parsed.providerId) {
          schedulePersist({ ...DEFAULTS, ...migrated });
        }
        return;
      }
    } catch {
      /* fall through — use defaults */
    }
    set({ hydrated: true });
  },
  setHFToken: (t) => {
    const cleaned = t.trim();
    set({ hfToken: cleaned });
    schedulePersist({ ...get(), hfToken: cleaned });
  },
  setPollToken: (t) => {
    const cleaned = t.trim();
    set({ pollToken: cleaned });
    schedulePersist({ ...get(), pollToken: cleaned });
  },
  setOpenAIToken: (t) => {
    const cleaned = t.trim();
    set({ openaiToken: cleaned });
    schedulePersist({ ...get(), openaiToken: cleaned });
  },
  setGeminiToken: (t) => {
    const cleaned = t.trim();
    set({ geminiToken: cleaned });
    schedulePersist({ ...get(), geminiToken: cleaned });
  },
  setHFModelId: (id) => {
    set({ hfModelId: id });
    schedulePersist({ ...get(), hfModelId: id });
  },
  setProviderId: (id) => {
    set({ providerId: id });
    schedulePersist({ ...get(), providerId: id });
  },
  recordGeneration: (g) => {
    const next = [g, ...get().history].slice(0, HISTORY_LIMIT);
    set({ history: next });
    schedulePersist({ ...get(), history: next });
  },
  bumpDailyGen: () => {
    const today = localDayKey(new Date());
    const cur = get().dailyGen;
    // Roll over to a fresh count when the local day changed; otherwise
    // increment in place. This is the source of truth for the free-tier
    // gate — independent of `history`, so deleting history can't reset it.
    const dailyGen =
      cur.dayKey === today
        ? { dayKey: today, count: cur.count + 1 }
        : { dayKey: today, count: 1 };
    set({ dailyGen });
    schedulePersist({ ...get(), dailyGen });
  },
  removeGeneration: (localUri) => {
    const next = get().history.filter((g) => g.localUri !== localUri);
    // No-op early-return so we don't burn a persist write when the
    // URI wasn't actually in history (e.g., double-tap on delete).
    if (next.length === get().history.length) return;
    set({ history: next });
    schedulePersist({ ...get(), history: next });
  },
  clearHistory: () => {
    set({ history: [] });
    schedulePersist({ ...get(), history: [] });
  },
  reset: () => {
    // In-memory only — keep `hydrated` true so callers don't re-trigger
    // a hydrate after a sign-out. The disk copy is intentionally NOT
    // touched here (that's `resetAll`'s job); this is the cheap path the
    // auth sign-out flow calls to drop the previous user's session data.
    set({ ...DEFAULTS, hydrated: true });
  },
  resetAll: async () => {
    set({ ...DEFAULTS, hydrated: true });
    const s = getStorage();
    if (s) {
      try {
        await s.removeItem(PERSIST_KEY);
      } catch {
        /* in-memory reset is sufficient */
      }
    }
  },
  todayCount: () => {
    const today = localDayKey(new Date());
    const { dailyGen } = get();
    // The persisted, history-independent counter is authoritative for the
    // free-tier quota (AI-M1). If it's stale (a previous local day), today's
    // count is 0 — bumpDailyGen will roll it over on the next success.
    return dailyGen.dayKey === today ? dailyGen.count : 0;
  },
}));

/** Bootstrap helper — called from `app/_layout.tsx`'s root effect. */
export async function hydrateAIStore(): Promise<void> {
  await useAIStore.getState().hydrate();
}
