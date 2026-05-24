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
 * The model registry (`huggingface.models.ts`) lists the alternatives the
 * user can swap to from Settings. Adding a new HF-hosted model is one row.
 * Error-status interpretation lives in `huggingface.errors.ts`.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useAIStore } from '../../../store/ai';
import { DEFAULT_HF_TOKEN } from '../defaults';
import {
  aspectToSize,
  type AIProvider,
  type ImageGenRequest,
  type ImageGenResult,
} from '../types';
import { FALLBACK_MODEL_ID, HF_MODELS } from './huggingface.models';
import { blobToBase64 } from './huggingface.io';
import { mapHFErrorResponse } from './huggingface.errors';

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
     * etc. The body is consumed here, then `mapHFErrorResponse` uses
     * the captured text so the later JSON-parse branches still work
     * for the 503 cold-start path.
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

    // Interpret every non-2xx status (503/401/403/404/429/4xx) → a
    // user-facing ImageGenResult. Returns null only when res.ok, in
    // which case we fall through to read the image bytes.
    const errResult = await mapHFErrorResponse(res, errorBody, model);
    if (errResult) return errResult;

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
