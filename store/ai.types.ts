/**
 * Type contract for `store/ai.ts` (AI image-generation state). Extracted so
 * the store file holds behaviour and this file holds shape.
 */
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

export type AIStore = AIState & {
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
