/**
 * Pollinations.ai provider.
 *
 * Why this is the default:
 *   - Free. No signup required for the anonymous tier.
 *   - Backs FLUX, the same SOTA diffusion model Hugging Face gates behind
 *     paid Inference Providers credits.
 *   - GET-based — one URL, image bytes come back directly.
 *
 * Endpoint contract:
 *   GET https://image.pollinations.ai/prompt/{encoded-prompt}
 *       ?width=W&height=H&model=flux&nologo=true&seed=N&referrer=…
 *
 * ─── Rate limits (the cause of the "402 after 2 generations" bug) ──────
 *
 * Pollinations moved to a tiered model. Confirmed against their API docs
 * (changes/0NN):
 *
 *   Tier        Limit                 Auth
 *   ─────────   ───────────────────   ───────────────────────────────────
 *   Anonymous   1 request / 15 s      none
 *   Seed        1 request / 5 s       free token from auth.pollinations.ai
 *   Flower      1 request / 3 s       paid
 *
 * When you exceed the tier's window the server bounces the request with a
 * **402 (insufficient balance)** or **429**. The old provider treated 402
 * as a generic "please retry" — which just hammered the limit harder. The
 * new provider instead:
 *
 *   1. Keeps a process-wide stamp of the last request and refuses to fire
 *      again inside the tier's window, returning a friendly `rate_limited`
 *      countdown so the UI can tell the user exactly how long to wait
 *      (no silent 15 s spinner, no surprise 402).
 *   2. Sends a `referrer` so Pollinations can attribute traffic to the app.
 *   3. Sends `Authorization: Bearer <token>` when the user has pasted a
 *      free Pollinations token in Settings — that alone moves them from
 *      the 15 s window to the 5 s window. Optional; anonymous still works.
 *   4. Retries ONCE on a transient 5xx (server hiccup, not a rate cap).
 *
 * `isConfigured()` returns true unconditionally — anonymous needs no token.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useAIStore } from '../../../store/ai';
import {
  aspectToSize,
  type AIProvider,
  type ImageGenRequest,
  type ImageGenResult,
} from '../types';

const ENDPOINT = 'https://image.pollinations.ai/prompt/';

/** Identifies the app to Pollinations. Their docs use the referrer to
 *  attribute and rank traffic; sending it costs nothing and can only
 *  help our standing with the rate limiter. */
const REFERRER = 'kawaii-baby-wallpapers.app';

/** Tier windows, with a small safety margin over the documented value so
 *  clock skew between us and the server doesn't land us 200 ms inside the
 *  window and eat a 402. */
const ANON_WINDOW_MS = 15_500;
const TOKEN_WINDOW_MS = 5_500;

/** Process-wide stamp of the last request we fired (any outcome). Module
 *  scope so it survives across re-renders / multiple screens within one
 *  app session. Not persisted — a fresh launch starts clean. */
let lastRequestAt = 0;

type PollModel = {
  id: string;
  displayName: string;
};

const POLL_MODELS: PollModel[] = [
  { id: 'flux', displayName: 'FLUX · best quality' },
  { id: 'turbo', displayName: 'Turbo · fastest' },
  { id: 'flux-anime', displayName: 'FLUX Anime' },
  { id: 'flux-realism', displayName: 'FLUX Realism' },
  { id: 'flux-3d', displayName: 'FLUX 3D' },
];

const DEFAULT_MODEL_ID = POLL_MODELS[0].id;

/** Optional free Pollinations token (auth.pollinations.ai). Empty = the
 *  anonymous tier. Stored separately from the HF token in `store/ai.ts`. */
function effectivePollToken(): string {
  const t = useAIStore.getState().pollToken;
  return t && t.trim().length > 0 ? t.trim() : '';
}

/** True iff the user has supplied a Pollinations token — used by the
 *  Settings UI label. */
export function isUsingPollToken(): boolean {
  return effectivePollToken().length > 0;
}

function makeAbortError(): Error {
  const e = new Error('Generation cancelled.');
  (e as { name?: string }).name = 'AbortError';
  return e;
}

/** Promise-based sleep that rejects with an AbortError if `signal` fires,
 *  so a user-initiated cancel during a backoff wait is honoured. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
      reject(makeAbortError());
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });
}

export const pollinationsProvider: AIProvider = {
  id: 'pollinations',
  displayName: 'Pollinations',
  description: 'Free · no token · runs FLUX',
  isPremium: false,
  defaultModel: DEFAULT_MODEL_ID,
  availableModels: POLL_MODELS.map((m) => ({ id: m.id, displayName: m.displayName })),

  /** No token to validate — Pollinations is open and unauthenticated. */
  isConfigured: () => true,

  generateImage: async (
    req: ImageGenRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenResult> => {
    const startedAt = Date.now();
    const prompt = req.prompt.trim();
    if (!prompt) {
      return {
        ok: false,
        reason: 'invalid_prompt',
        message: 'Type a prompt before generating.',
      };
    }
    if (prompt.length > 1500) {
      return {
        ok: false,
        reason: 'invalid_prompt',
        message: 'Prompt too long — keep it under 1500 characters.',
      };
    }

    const token = effectivePollToken();
    const windowMs = token ? TOKEN_WINDOW_MS : ANON_WINDOW_MS;

    // ─── Client-side rate gate (the real 402 fix) ──────────────────────
    // If we're still inside the tier's window since the last request,
    // refuse PROACTIVELY with a precise countdown instead of firing a
    // request the server will reject with 402/429. This is what stops
    // the "works twice then 402 forever" loop: we never exceed the cap
    // in the first place.
    const sinceLast = Date.now() - lastRequestAt;
    if (lastRequestAt > 0 && sinceLast < windowMs) {
      const waitMs = windowMs - sinceLast;
      const waitS = Math.ceil(waitMs / 1000);
      return {
        ok: false,
        reason: 'rate_limited',
        message: token
          ? `One image every ${Math.round(windowMs / 1000)}s on the free tier — try again in ${waitS}s.`
          : `Free tier allows one image every ${Math.round(
              windowMs / 1000,
            )}s. Try again in ${waitS}s — or add a free Pollinations token in Settings to speed this up.`,
        retryAfterMs: waitMs,
      };
    }

    const size = aspectToSize(req.aspect ?? '9:16');
    const params = new URLSearchParams({
      width: String(size.width),
      height: String(size.height),
      model: DEFAULT_MODEL_ID,
      nologo: 'true',
      referrer: REFERRER,
      seed: String(req.seed ?? Math.floor(Math.random() * 1_000_000)),
    });
    const url = `${ENDPOINT}${encodeURIComponent(prompt)}?${params.toString()}`;

    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    // Prod-visible breadcrumb — matches the [ai/huggingface] one so log
    // filtering catches both. Token VALUE is never logged.
    console.warn(
      `[ai/pollinations] generate model=${DEFAULT_MODEL_ID} tier=${
        token ? 'token' : 'anon'
      } promptHead="${prompt.slice(0, 40).replace(/"/g, "'")}"`,
    );

    // One retry budget, used ONLY for transient 5xx — never for 402/429
    // (those need the time window to pass, so retrying immediately just
    // burns the budget; we surface a countdown for those instead).
    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      lastRequestAt = Date.now();
      let res: Response;
      try {
        res = await fetch(url, { method: 'GET', headers, signal });
      } catch (e) {
        const isAbort = (e as { name?: string })?.name === 'AbortError';
        return {
          ok: false,
          reason: isAbort ? 'cancelled' : 'network',
          message: isAbort
            ? 'Generation cancelled.'
            : 'Network error — check your connection and try again.',
        };
      }

      const ct = res.headers.get('content-type') ?? '?';
      console.warn(
        `[ai/pollinations] response status=${res.status} ct=${ct} attempt=${attempt}`,
      );

      // ─── 402 / 429 — rate / balance cap ──────────────────────────────
      if (res.status === 402 || res.status === 429) {
        return {
          ok: false,
          reason: 'rate_limited',
          message: token
            ? `Pollinations is at its rate limit right now — wait ~${Math.round(
                windowMs / 1000,
              )}s and try again.`
            : `Pollinations' free tier is busy (one image every ~${Math.round(
                ANON_WINDOW_MS / 1000,
              )}s). Wait a few seconds and retry — or add a free token in Settings → AI Generator for a higher limit.`,
          retryAfterMs: windowMs,
        };
      }

      // ─── 5xx — transient server error: retry once after a short wait ─
      if (res.status >= 500) {
        if (attempt < MAX_ATTEMPTS) {
          try {
            await sleep(3000, signal);
          } catch {
            return { ok: false, reason: 'cancelled', message: 'Generation cancelled.' };
          }
          continue;
        }
        return {
          ok: false,
          reason: 'unknown',
          message: `Pollinations is having a moment (server ${res.status}). Try again shortly.`,
        };
      }

      // ─── Other non-2xx ───────────────────────────────────────────────
      if (!res.ok) {
        return {
          ok: false,
          reason: 'unknown',
          message: `Pollinations returned ${res.status}. Please retry.`,
        };
      }

      // ─── 200 — binary image bytes ────────────────────────────────────
      try {
        const blob = await res.blob();
        const base64 = await blobToBase64(blob);
        const ext = ct.includes('png') ? 'png' : 'jpg';
        const fileName = `kawaii-ai-${Date.now()}.${ext}`;
        const target = `${FileSystem.cacheDirectory ?? ''}${fileName}`;
        await FileSystem.writeAsStringAsync(target, base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          ok: true,
          localUri: target,
          durationMs: Date.now() - startedAt,
          provider: 'pollinations',
          model: DEFAULT_MODEL_ID,
          width: size.width,
          height: size.height,
        };
      } catch (e) {
        console.warn('[ai/pollinations] write failed:', e);
        return {
          ok: false,
          reason: 'unknown',
          message: 'Got the image but failed to save it. Free some storage and retry.',
        };
      }
    }

    // Unreachable in practice (the loop always returns), but satisfies the
    // type checker that every path produces an ImageGenResult.
    return {
      ok: false,
      reason: 'unknown',
      message: 'Generation failed — please retry.',
    };
  },
};

/** Read a Blob as base64 — same helper as in `huggingface.ts`.
 *  Duplicated here so each provider stays self-contained; if a third
 *  provider needs this too we'll lift it to a shared util. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned non-string'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}
