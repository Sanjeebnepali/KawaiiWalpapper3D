/**
 * Hugging Face Inference API provider.
 *
 * Endpoint: POST https://api-inference.huggingface.co/models/{model}
 * Auth:     Authorization: Bearer hf_xxx (from `useAIStore.hfToken`)
 * Request:  JSON body — `{ inputs, parameters }`
 * Response: BINARY image bytes (image/jpeg or image/png) on 200 success.
 *           JSON `{ error, estimated_time }` on 503 (model loading).
 *           JSON `{ error }` on 4xx (auth / rate limit / invalid).
 *
 * Why FLUX.1-schnell as the default model:
 *   - Distilled to 4 steps — generations finish in ~3–5 s on free tier.
 *   - Strong stylized output, good for the kawaii / wallpaper use case.
 *   - Apache 2.0 license — no usage restrictions for our app.
 *   - guidance_scale must be 0 (distillation quirk); steps capped at 4.
 *
 * Model registry below lists the alternatives the user can swap to from
 * Settings. Adding a new HF-hosted model is one row.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useAIStore } from '../../../store/ai';
import { DEFAULT_HF_MODEL, DEFAULT_HF_TOKEN } from '../defaults';
import {
  aspectToSize,
  type AIProvider,
  type ImageGenRequest,
  type ImageGenResult,
} from '../types';

/**
 * Hugging Face Inference endpoint.
 *
 * Late 2024 / 2025 HF restructured the Inference API. The legacy host
 * `https://api-inference.huggingface.co/models/{model}` was deprecated
 * and now returns generic CDN 404 pages (`Content-Type: text/html`)
 * for almost every model — that's the user-reported failure we
 * captured in logcat as `status=404 ct=text/html`.
 *
 * The current canonical path is the Inference Providers router:
 *   https://router.huggingface.co/hf-inference/models/{model}
 *
 * Same auth (Bearer hf_…), same request body shape, same response
 * shape (binary image bytes on 200, JSON `error` + `estimated_time`
 * on 503). Switching is a one-line change for callers.
 *
 * If a user reports another HTML-404 in the future, the route again
 * shifted — check `huggingface.co/docs/inference-providers` for the
 * current path.
 */
const ENDPOINT = 'https://router.huggingface.co/hf-inference/models/';

/** Active token = user override (if set) OR the build-time default.
 *  Centralised here so every code path (call + isConfigured + UI hint)
 *  resolves the same way. */
function effectiveToken(): string {
  const userToken = useAIStore.getState().hfToken;
  return userToken && userToken.length > 0 ? userToken : DEFAULT_HF_TOKEN;
}

/** True iff the user has supplied their OWN token (vs falling back to the
 *  embedded default). Settings UI uses this to render the "Using app
 *  default" vs "Using your token" labels. */
export function isUsingUserHFToken(): boolean {
  const userToken = useAIStore.getState().hfToken;
  return Boolean(userToken && userToken.length > 0);
}

/**
 * Supported HF text-to-image models. Each row provides the defaults the
 * provider should use when the user doesn't override them — different
 * models need WILDLY different `steps` and `guidanceScale` (FLUX-schnell:
 * 4 + 0, SDXL: 25 + 7.5). Hiding this complexity here keeps the UI
 * uniform across models.
 */
type HFModel = {
  id: string;
  displayName: string;
  defaultSteps: number;
  defaultGuidance: number;
  /** Does this model accept `width` / `height` in its parameters? Some
   *  HF wrappers ignore them; documented here to avoid wasted bytes. */
  acceptsSize: boolean;
};

const HF_MODELS: HFModel[] = [
  // ─── Reliably available on HF free serverless tier ─────────────────
  // These models DO work via the legacy `api-inference.huggingface.co`
  // endpoint with a plain Read token. Order here drives the dropdown
  // order in Settings.
  {
    id: 'stabilityai/stable-diffusion-xl-base-1.0',
    displayName: 'Stable Diffusion XL · default',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  {
    id: 'runwayml/stable-diffusion-v1-5',
    displayName: 'Stable Diffusion 1.5 · fastest',
    defaultSteps: 20,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  {
    id: 'stabilityai/stable-diffusion-2-1',
    displayName: 'Stable Diffusion 2.1',
    defaultSteps: 25,
    defaultGuidance: 7.5,
    acceptsSize: true,
  },
  // ─── Premium / Inference Providers — may 404 on free tier ──────────
  // FLUX-schnell was pulled from HF's free serverless API in late 2024
  // and now routes through paid "Inference Providers." Listed here so
  // users with credits / paid plans can still pick it, but the default
  // (`DEFAULT_HF_MODEL`) lives above to keep new installs working out
  // of the box. The 404 reason mapping in `generateImage` below
  // surfaces a clear "needs paid plan" message when a free user hits
  // this model.
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    displayName: 'FLUX.1-schnell · needs paid plan',
    defaultSteps: 4,
    defaultGuidance: 0,
    acceptsSize: true,
  },
];

const FALLBACK_MODEL_ID = DEFAULT_HF_MODEL;

export const huggingfaceProvider: AIProvider = {
  id: 'huggingface',
  displayName: 'Hugging Face',
  description: 'Free out of the box — paste your own token in Settings for higher quota.',
  isPremium: false,
  defaultModel: FALLBACK_MODEL_ID,
  availableModels: HF_MODELS.map((m) => ({ id: m.id, displayName: m.displayName })),

  isConfigured: () => {
    const t = effectiveToken();
    // True if EITHER the user supplied a token OR the build-time default
    // is non-empty. So a clean install with a baked-in default token
    // works out of the box; the UI hint to "paste your own" only shows
    // when both are blank.
    return typeof t === 'string' && t.startsWith('hf_') && t.length > 10;
  },

  generateImage: async (
    req: ImageGenRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenResult> => {
    const startedAt = Date.now();
    const state = useAIStore.getState();
    const token = effectiveToken();
    const modelId = state.hfModelId || FALLBACK_MODEL_ID;
    const model = HF_MODELS.find((m) => m.id === modelId) ?? HF_MODELS[0];

    // ─── Pre-flight: token + prompt validation ─────────────────────────
    if (!token) {
      return {
        ok: false,
        reason: 'auth_missing',
        message:
          'No AI token available. Paste your Hugging Face token in Settings → AI Generator Settings.',
      };
    }
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

    // ─── Body assembly — model-specific knobs ──────────────────────────
    const size = aspectToSize(req.aspect ?? '9:16');
    const parameters: Record<string, unknown> = {
      num_inference_steps: req.steps ?? model.defaultSteps,
      guidance_scale: req.guidanceScale ?? model.defaultGuidance,
    };
    if (model.acceptsSize) {
      parameters.width = size.width;
      parameters.height = size.height;
    }
    if (req.negativePrompt) parameters.negative_prompt = req.negativePrompt;
    if (req.seed != null) parameters.seed = req.seed;
    if (req.extra) Object.assign(parameters, req.extra);

    const body = JSON.stringify({ inputs: prompt, parameters });

    // Prod-visible breadcrumb — landed in changes/064 after the user
    // reported "ai photo generate log i got problem there" but every
    // ai/* console.warn was __DEV__-gated and invisible in release.
    // Logs the model + token type (user/default) + a prompt prefix so
    // `adb logcat -s ReactNativeJS:V` can show whether the request
    // even fires. Token VALUE is never logged.
    console.warn(
      `[ai/huggingface] generate model=${model.id} token=${
        useAIStore.getState().hfToken ? 'user' : 'default'
      } promptHead="${prompt.slice(0, 40).replace(/"/g, "'")}"`,
    );

    // ─── Fire the request ──────────────────────────────────────────────
    let res: Response;
    try {
      res = await fetch(ENDPOINT + model.id, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'image/png',
        },
        body,
        signal,
      });
    } catch (e) {
      // AbortController.abort() rejects with a DOMException whose .name
      // is 'AbortError'. Distinguish so the UI doesn't toast a network
      // error for a user-initiated cancel.
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
    // Breadcrumb — actual HF status returned + content-type. The
    // various branches below short-circuit before the success path,
    // so this single line lets us identify the failure mode from
    // logcat alone.
    console.warn(`[ai/huggingface] response status=${res.status} ct=${ct}`);

    /**
     * On any non-2xx, peek the response body so the prod log shows
     * the actual error HF returned (`{ error: '…', error_type: '…' }`).
     * Without this we get "403" with no message and have to guess
     * between gated-model / wrong-token-permission / wallet-empty /
     * etc. The body is consumed here, then a synthetic Response-like
     * object is used downstream so the later JSON-parse branches still
     * work for the 503 cold-start path.
     *
     * For 200 success we DO NOT peek (it's binary image data, not
     * JSON; peeking would force a wasted base64 round-trip).
     */
    let errorBody = '';
    if (!res.ok && ct.includes('json')) {
      try {
        errorBody = await res.text();
        console.warn(
          `[ai/huggingface] error body: ${errorBody.slice(0, 400)}`,
        );
      } catch {
        /* body unreadable — leave empty */
      }
    }

    /** Extract `error` / `error_type` strings from a captured JSON
     *  error body. Returns the first non-empty match or null. */
    const parseErrorBody = (): { error: string | null; type: string | null } => {
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
    };

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
      const { error } = parseErrorBody();
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
      const { error, type } = parseErrorBody();
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
      const { error } = parseErrorBody();
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

    // ─── 200 — binary image bytes ──────────────────────────────────────
    // Read as base64 (RN fetch doesn't expose a Blob.arrayBuffer that
    // works reliably on Android) and write to cacheDirectory. Using
    // `FileSystem.writeAsStringAsync({ encoding: 'base64' })` because
    // legacy expo-file-system handles it without a buffer copy.
    try {
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const ext = (res.headers.get('content-type') ?? 'image/jpeg').includes('png') ? 'png' : 'jpg';
      const fileName = `kawaii-ai-${Date.now()}.${ext}`;
      const target = `${FileSystem.cacheDirectory ?? ''}${fileName}`;
      await FileSystem.writeAsStringAsync(target, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const finalSize = model.acceptsSize ? size : { width: undefined, height: undefined };
      return {
        ok: true,
        localUri: target,
        durationMs: Date.now() - startedAt,
        provider: 'huggingface',
        model: model.id,
        width: finalSize.width,
        height: finalSize.height,
      };
    } catch (e) {
      console.warn('[ai/huggingface] write failed:', e);
      return {
        ok: false,
        reason: 'unknown',
        message: 'Got the image but failed to save it. Free some storage and retry.',
      };
    }
  },
};

/** Read a Blob as base64. React Native's FileReader supports this via
 *  `readAsDataURL`, then we strip the leading `data:image/...;base64,`. */
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
