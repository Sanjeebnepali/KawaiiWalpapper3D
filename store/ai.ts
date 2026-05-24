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
 *
 * The type contract lives in `ai.types.ts`; the AsyncStorage persistence
 * helpers live in `ai.persistence.ts`.
 */

import { create } from 'zustand';
import { HISTORY_LIMIT } from './ai.types';
import type { AIState, AIStore } from './ai.types';
import {
  getStorage,
  localDayKey,
  PERSIST_KEY,
  schedulePersist,
} from './ai.persistence';

// Preserve the public surface of `store/ai` so existing importers keep
// working unchanged.
export { HISTORY_LIMIT };
export type { AIGeneration, AIState, AIStore } from './ai.types';

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
