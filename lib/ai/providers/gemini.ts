/**
 * Google Gemini (Imagen) provider.
 *
 * The user pastes their OWN Google API key (Settings → AI Generator); usage
 * is billed by Google to that key, so there's no app-side daily cap (see
 * `hasUnlimitedGeneration` in lib/ai/client.ts). Requires a key.
 *
 * Endpoint contract (Generative Language API · Imagen predict):
 *   POST https://generativelanguage.googleapis.com/v1beta/models/<model>:predict?key=<key>
 *   { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio } }
 *   → { predictions: [{ bytesBase64Encoded, mimeType }] }
 *   error → { error: { code, message, status } }
 *
 * Imagen accepts aspectRatio directly in {1:1,3:4,4:3,9:16,16:9}, which maps
 * 1:1 from our presets.
 *
 * NOTE: implemented to Google's documented Imagen API but verified by the
 * owner with a real key (we have none to test live). Imagen on the Gemini API
 * requires billing enabled on the Google project. If the model id / endpoint
 * changes, this is the only file to touch.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useAIStore } from '../../../store/ai';
import type { AIProvider, AspectRatio, ImageGenRequest, ImageGenResult } from '../types';

const MODEL = 'imagen-3.0-generate-002';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict`;

/** Imagen takes the aspect ratio as a string directly. */
function aspectParam(aspect: AspectRatio): string {
  // Every preset maps 1:1 onto an Imagen-supported value.
  return aspect;
}

function token(): string {
  const t = useAIStore.getState().geminiToken;
  return t && t.trim().length > 0 ? t.trim() : '';
}

export const geminiProvider: AIProvider = {
  id: 'gemini',
  displayName: 'Google Gemini (Imagen)',
  description: 'Your Google key · unlimited',
  isPremium: false,
  defaultModel: MODEL,
  isConfigured: () => token().length > 0,

  generateImage: async (
    req: ImageGenRequest,
    signal?: AbortSignal,
  ): Promise<ImageGenResult> => {
    const startedAt = Date.now();
    const prompt = req.prompt.trim();
    if (!prompt) {
      return { ok: false, reason: 'invalid_prompt', message: 'Type a prompt before generating.' };
    }
    if (prompt.length > 4000) {
      return { ok: false, reason: 'invalid_prompt', message: 'Prompt too long — keep it under 4000 characters.' };
    }
    const key = token();
    if (!key) {
      return {
        ok: false,
        reason: 'auth_missing',
        message: 'Add your Google API key in Settings → AI Generator to use Gemini.',
      };
    }

    const aspect = aspectParam(req.aspect ?? '9:16');
    console.warn(
      `[ai/gemini] generate model=${MODEL} aspect=${aspect} promptHead="${prompt
        .slice(0, 40)
        .replace(/"/g, "'")}"`,
    );

    let res: Response;
    try {
      res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: aspect },
        }),
        signal,
      });
    } catch (e) {
      const isAbort = (e as { name?: string })?.name === 'AbortError';
      return {
        ok: false,
        reason: isAbort ? 'cancelled' : 'network',
        message: isAbort ? 'Generation cancelled.' : 'Network error — check your connection and try again.',
      };
    }

    if (!res.ok) {
      let detail = '';
      try {
        const body = (await res.json()) as { error?: { message?: string; status?: string } };
        detail = body?.error?.message ?? '';
      } catch {
        /* non-JSON error body */
      }
      console.warn(`[ai/gemini] error status=${res.status} detail="${detail.slice(0, 80)}"`);
      if (res.status === 400 && /api key/i.test(detail)) {
        return { ok: false, reason: 'auth_invalid', message: 'Google rejected your API key. Check it in Settings → AI Generator.' };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: 'auth_invalid', message: 'Google rejected your API key (or Imagen isn’t enabled / billed on your project).' };
      }
      if (res.status === 429) {
        return { ok: false, reason: 'rate_limited', message: detail || 'Google rate limit / quota hit. Check your Google Cloud billing and retry.' };
      }
      return { ok: false, reason: 'unknown', message: detail || `Gemini returned ${res.status}. Please retry.` };
    }

    let b64 = '';
    try {
      const body = (await res.json()) as {
        predictions?: Array<{ bytesBase64Encoded?: string }>;
      };
      b64 = body?.predictions?.[0]?.bytesBase64Encoded ?? '';
    } catch {
      return { ok: false, reason: 'unknown', message: 'Gemini sent a response we couldn’t read. Please retry.' };
    }
    if (!b64) {
      // Imagen returns empty predictions when its safety filter blocks output.
      return { ok: false, reason: 'safety_filter', message: 'Gemini returned no image (often a content-policy block). Try a different prompt.' };
    }

    try {
      const target = `${FileSystem.cacheDirectory ?? ''}kawaii-ai-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(target, b64, { encoding: FileSystem.EncodingType.Base64 });
      return {
        ok: true,
        localUri: target,
        durationMs: Date.now() - startedAt,
        provider: 'gemini',
        model: MODEL,
      };
    } catch (e) {
      console.warn('[ai/gemini] write failed:', e);
      return { ok: false, reason: 'unknown', message: 'Got the image but failed to save it. Free some storage and retry.' };
    }
  },
};
