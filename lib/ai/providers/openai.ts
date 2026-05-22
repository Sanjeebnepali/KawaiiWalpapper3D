/**
 * OpenAI DALL·E 3 provider.
 *
 * The user pastes their OWN OpenAI API key (Settings → AI Generator); usage
 * is billed by OpenAI to that key, so there's no app-side daily cap (see
 * `hasUnlimitedGeneration` in lib/ai/client.ts). Requires a key — anonymous
 * use is impossible.
 *
 * Endpoint contract (Images API):
 *   POST https://api.openai.com/v1/images/generations
 *   Authorization: Bearer <key>
 *   { model: 'dall-e-3', prompt, n: 1, size, response_format: 'b64_json' }
 *   → { data: [{ b64_json }] }   |   { error: { message, code, type } }
 *
 * DALL·E 3 only accepts three sizes (1024², 1024×1792, 1792×1024), so we map
 * the app's aspect presets onto the nearest portrait/landscape/square.
 *
 * NOTE: implemented to OpenAI's documented API but verified by the owner with
 * a real key (we have none to test live). If the model/size contract changes,
 * this is the only file to touch.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { useAIStore } from '../../../store/ai';
import type { AIProvider, AspectRatio, ImageGenRequest, ImageGenResult } from '../types';

const ENDPOINT = 'https://api.openai.com/v1/images/generations';
const MODEL = 'dall-e-3';

/** DALL·E 3 supports exactly these sizes — map our aspect presets on. */
function sizeFor(aspect: AspectRatio): { size: string; width: number; height: number } {
  switch (aspect) {
    case '16:9':
    case '4:3':
      return { size: '1792x1024', width: 1792, height: 1024 };
    case '1:1':
      return { size: '1024x1024', width: 1024, height: 1024 };
    case '9:16':
    case '3:4':
    default:
      return { size: '1024x1792', width: 1024, height: 1792 };
  }
}

function token(): string {
  const t = useAIStore.getState().openaiToken;
  return t && t.trim().length > 0 ? t.trim() : '';
}

export const openaiProvider: AIProvider = {
  id: 'dalle',
  displayName: 'ChatGPT (DALL·E 3)',
  description: 'Your OpenAI key · unlimited',
  // Not gated behind OUR premium — any user can use it with their own key.
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
        message: 'Add your OpenAI API key in Settings → AI Generator to use DALL·E.',
      };
    }

    const { size, width, height } = sizeFor(req.aspect ?? '9:16');
    console.warn(
      `[ai/openai] generate model=${MODEL} size=${size} promptHead="${prompt
        .slice(0, 40)
        .replace(/"/g, "'")}"`,
    );

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          prompt,
          n: 1,
          size,
          response_format: 'b64_json',
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
        const body = (await res.json()) as { error?: { message?: string; code?: string } };
        detail = body?.error?.message ?? '';
      } catch {
        /* non-JSON error body */
      }
      console.warn(`[ai/openai] error status=${res.status} detail="${detail.slice(0, 80)}"`);
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: 'auth_invalid', message: 'OpenAI rejected your API key. Check it in Settings → AI Generator.' };
      }
      if (res.status === 429) {
        return {
          ok: false,
          reason: 'rate_limited',
          message: detail || 'OpenAI rate limit / quota hit. Check your OpenAI billing and try again.',
        };
      }
      if (res.status === 400 && /content|safety|policy/i.test(detail)) {
        return { ok: false, reason: 'safety_filter', message: 'OpenAI blocked this prompt by its content policy. Try a different prompt.' };
      }
      return { ok: false, reason: 'unknown', message: detail || `OpenAI returned ${res.status}. Please retry.` };
    }

    let b64 = '';
    try {
      const body = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      b64 = body?.data?.[0]?.b64_json ?? '';
    } catch {
      return { ok: false, reason: 'unknown', message: 'OpenAI sent a response we couldn’t read. Please retry.' };
    }
    if (!b64) {
      return { ok: false, reason: 'unknown', message: 'OpenAI returned no image. Please retry.' };
    }

    try {
      const target = `${FileSystem.cacheDirectory ?? ''}kawaii-ai-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(target, b64, { encoding: FileSystem.EncodingType.Base64 });
      return {
        ok: true,
        localUri: target,
        durationMs: Date.now() - startedAt,
        provider: 'dalle',
        model: MODEL,
        width,
        height,
      };
    } catch (e) {
      console.warn('[ai/openai] write failed:', e);
      return { ok: false, reason: 'unknown', message: 'Got the image but failed to save it. Free some storage and retry.' };
    }
  },
};
