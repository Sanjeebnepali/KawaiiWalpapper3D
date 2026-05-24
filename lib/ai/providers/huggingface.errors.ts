/**
 * Hugging Face error-response interpretation. Extracted verbatim from
 * `huggingface.ts:generateImage` so the provider file holds the request
 * flow and this file holds "what does this non-2xx status mean for the
 * user". Behaviour is identical to the inline version it replaced.
 */
import { type ImageGenResult } from '../types';
import { type HFModel } from './huggingface.models';

/** Extract `error` / `error_type` strings from a captured JSON
 *  error body. Returns the first non-empty match or null. */
export function parseHFErrorBody(errorBody: string): {
  error: string | null;
  type: string | null;
} {
  if (!errorBody) return { error: null, type: null };
  try {
    const parsed = JSON.parse(errorBody) as {
      error?: unknown;
      error_type?: unknown;
    };
    const error = typeof parsed.error === 'string' ? parsed.error : null;
    const type = typeof parsed.error_type === 'string' ? parsed.error_type : null;
    return { error, type };
  } catch {
    return { error: null, type: null };
  }
}

/**
 * Map a Hugging Face response to an ImageGenResult error, or return `null`
 * when the response is OK (the caller then reads the image bytes).
 * `errorBody` is the already-consumed JSON error text (empty if the body
 * wasn't JSON); the 503 branch falls back to `await res.json()` exactly as
 * the original inline code did.
 */
export async function mapHFErrorResponse(
  res: Response,
  errorBody: string,
  model: HFModel,
): Promise<ImageGenResult | null> {
  // ─── 503 model_loading — first call into a cold model ──────────────
  if (res.status === 503) {
    let estimated_time = 25; // default if HF doesn't tell us
    try {
      const json = errorBody ? (JSON.parse(errorBody) as { estimated_time?: number }) : await res.json();
      if (typeof json.estimated_time === 'number') estimated_time = json.estimated_time;
    } catch {
      /* malformed — fall through with the default */
    }
    // Clamp the server-supplied estimate (AI-6). HF occasionally
    // returns wildly large `estimated_time` values; an unclamped
    // retry would schedule a minutes-long timer in the UI. 60 s is a
    // sane ceiling for a cold-start wait.
    estimated_time = Math.min(estimated_time, 60);
    return {
      ok: false,
      reason: 'model_loading',
      message: `Model is waking up — try again in ~${Math.ceil(estimated_time)}s.`,
      retryAfterMs: Math.ceil(estimated_time * 1000),
    };
  }

  // ─── 401 — token wrong / revoked ───────────────────────────────────
  if (res.status === 401) {
    const { error } = parseHFErrorBody(errorBody);
    return {
      ok: false,
      reason: 'auth_invalid',
      message: error
        ? `Token rejected: ${error}. Re-paste it in Settings.`
        : 'Hugging Face token rejected. Re-paste it in Settings.',
    };
  }

  // ─── 403 — gated model / missing token permission / no credits ─────
  // The new Inference Providers router returns 403 for THREE
  // distinct reasons; the body tells us which:
  //   a) error_type: "model_gated" — visit the model page, accept terms
  //   b) error mentions "permission" / "scope" — token doesn't have
  //      "Make calls to Inference Providers" enabled
  //   c) error mentions "credits" / "subscription" — HF requires
  //      paid PRO or pay-as-you-go to use this provider/model
  // We log the raw body above so the caller has full diagnostic.
  if (res.status === 403) {
    const { error, type } = parseHFErrorBody(errorBody);
    const e = (error ?? '').toLowerCase();
    let message: string;
    if (type === 'model_gated' || e.includes('gated') || e.includes('accept')) {
      message = `Model "${model.id}" needs you to accept its terms first. Open huggingface.co/${model.id} in a browser, click Accept, then retry.`;
    } else if (e.includes('permission') || e.includes('scope') || e.includes('inference')) {
      message =
        'Your Hugging Face token needs the "Make calls to Inference Providers" permission. Go to huggingface.co/settings/tokens → edit the token → enable that permission, then retry.';
    } else if (e.includes('credit') || e.includes('subscription') || e.includes('quota')) {
      message =
        'Hugging Face says this account is out of inference credits. Either wait for the monthly reset, upgrade to PRO, or paste a different token in Settings.';
    } else {
      message = error
        ? `HF refused: ${error}`
        : `Access denied to "${model.id}". Check token permissions in Hugging Face Settings.`;
    }
    return { ok: false, reason: 'auth_invalid', message };
  }

  // ─── 404 — model not on free serverless tier ───────────────────────
  // Two flavours:
  //   a) JSON 404 with `Content-Type: application/json` — model
  //      missing OR not available on this provider. Tell the user
  //      to switch model.
  //   b) HTML 404 (`Content-Type: text/html`) — the HF route itself
  //      is wrong, not a model issue. Happens when HF deprecates
  //      an endpoint path (see top-of-file comment on ENDPOINT).
  //      Surface a clearer "endpoint moved" message; switching
  //      models won't help.
  if (res.status === 404) {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) {
      return {
        ok: false,
        reason: 'unknown',
        message:
          'Hugging Face changed their API path again. Update needed — please report this to the app maintainer.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      message: `Model "${model.id}" isn't available on the free Hugging Face tier. Switch to "Stable Diffusion XL" in Settings — that one works out of the box.`,
    };
  }

  // ─── 429 — rate limit / free-tier quota ────────────────────────────
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : undefined;
    return {
      ok: false,
      reason: 'rate_limited',
      message: 'Too many requests — wait a moment and try again.',
      retryAfterMs,
    };
  }

  // ─── 4xx (anything else) — parse the JSON error ────────────────────
  // Body was already consumed into `errorBody` above (when the
  // response was JSON); use that instead of trying to await
  // res.json() again, which would throw because the body stream is
  // already locked.
  if (!res.ok) {
    const { error } = parseHFErrorBody(errorBody);
    const message = error || `Hugging Face returned ${res.status}.`;
    // Crude safety-filter heuristic — HF surfaces a 422 for some
    // filtered prompts. Map to a clearer reason so the UI can guide.
    const isSafety = /nsfw|safety|inappropriate|filtered/i.test(message);
    return {
      ok: false,
      reason: isSafety ? 'safety_filter' : 'unknown',
      message,
    };
  }

  return null;
}
