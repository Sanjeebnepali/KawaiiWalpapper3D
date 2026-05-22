/**
 * Per-provider API-key UI config + a generic setter, so the single Settings
 * "token" row + sheet can adapt to whichever provider is active (Pollinations
 * / Hugging Face / OpenAI / Gemini) instead of hard-coding a poll-vs-hf
 * binary. The store keeps a separate token field per provider; this maps the
 * active `providerId` onto the right one.
 */

import { useAIStore } from '../../store/ai';
import type { AIProviderId } from './types';

export type TokenCfg = {
  /** TextInput placeholder. */
  placeholder: string;
  /** Bottom-sheet subtitle explaining the key. */
  subtitle: string;
  /** Hint under the input — where to get the key. */
  hint: string;
  /** Row right-text when no user key is set. */
  emptyStatus: string;
  /** Secondary (clear) button label. */
  clearLabel: string;
  /** If set, a pasted key must start with this or we warn. */
  requiredPrefix?: string;
};

export const AI_TOKEN_CFG: Record<string, TokenCfg> = {
  pollinations: {
    placeholder: 'paste token (optional)…',
    subtitle:
      'Optional. Pollinations works free with no token — a free token just lets you generate more often.',
    hint: 'Optional: get a free token at auth.pollinations.ai. Leave blank to stay on the free tier.',
    emptyStatus: 'Free · no token',
    clearLabel: 'No token',
  },
  huggingface: {
    placeholder: 'hf_…',
    subtitle:
      'Optional — the app ships with a working token. Add your own for higher quota on your account.',
    hint: 'Get a free token at huggingface.co → Access Tokens (role "Read").',
    emptyStatus: 'App default',
    clearLabel: 'Use default',
    requiredPrefix: 'hf_',
  },
  dalle: {
    placeholder: 'sk-…',
    subtitle:
      'Paste your OpenAI API key to generate with DALL·E 3 — unlimited, billed to your OpenAI account.',
    hint: 'Get a key at platform.openai.com → API keys. Image generation is billed by OpenAI.',
    emptyStatus: 'Not set',
    clearLabel: 'Clear',
    requiredPrefix: 'sk-',
  },
  gemini: {
    placeholder: 'AIza…',
    subtitle:
      'Paste your Google API key to generate with Gemini (Imagen) — unlimited, billed to your Google account.',
    hint: 'Get a key at aistudio.google.com → API keys. Imagen needs billing enabled.',
    emptyStatus: 'Not set',
    clearLabel: 'Clear',
  },
};

/** Write the key for whichever provider is active, via its store setter. */
export function setTokenFor(id: AIProviderId, value: string): void {
  const s = useAIStore.getState();
  switch (id) {
    case 'huggingface':
      s.setHFToken(value);
      break;
    case 'dalle':
      s.setOpenAIToken(value);
      break;
    case 'gemini':
      s.setGeminiToken(value);
      break;
    default:
      s.setPollToken(value);
      break;
  }
}
