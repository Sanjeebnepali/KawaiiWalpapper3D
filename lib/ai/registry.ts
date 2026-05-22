/**
 * Provider registry — the ONE PLACE you edit to add or remove a provider.
 *
 * The contract:
 *   1. Drop a new file in `lib/ai/providers/<name>.ts` exporting an
 *      `AIProvider` object.
 *   2. Import + add it to the `PROVIDERS` array below.
 *   3. Done.
 *
 * The client (`lib/ai/client.ts`) and the UI (`app/(tabs)/ai.tsx`) iterate
 * this array — nothing else hard-codes a provider id. Premium gating is
 * driven by the `isPremium` field on each provider, not by lookup tables
 * here.
 */

import type { AIProvider, AIProviderId } from './types';
import { huggingfaceProvider } from './providers/huggingface';
import { pollinationsProvider } from './providers/pollinations';
import { openaiProvider } from './providers/openai';
import { geminiProvider } from './providers/gemini';
// ─── Add new providers here ────────────────────────────────────────────
// import { stabilityProvider } from './providers/stability';
// import { replicateProvider } from './providers/replicate';
// ──────────────────────────────────────────────────────────────────────

export const PROVIDERS: AIProvider[] = [
  // Order matters — the FIRST entry is what `getProvider()` falls back
  // to when the persisted id is unknown / cleared, and what new
  // installs use as the default. Keep the free / no-setup provider
  // at position 0.
  pollinationsProvider,
  huggingfaceProvider,
  // Bring-your-own-key providers — usable by anyone who pastes their key
  // (unlimited, billed to their account). Not gated behind app premium.
  openaiProvider,
  geminiProvider,
  // stabilityProvider,
  // replicateProvider,
];

/** Default provider id used when the store hasn't been touched (first
 *  launch) or when the persisted id no longer matches a known provider.
 *  Pollinations is genuinely free and requires zero setup — the right
 *  default for the "every user has working AI gen out of the box"
 *  promise. Users with a paid HF account can switch via Settings. */
export const DEFAULT_PROVIDER_ID: AIProviderId = 'pollinations';

/** Lookup with fallback — never returns null, so call sites don't need
 *  to nil-check. An unknown id resolves to the default provider, which
 *  is always present in `PROVIDERS`. */
export function getProvider(id: AIProviderId | null | undefined): AIProvider {
  const found = PROVIDERS.find((p) => p.id === id);
  return found ?? PROVIDERS.find((p) => p.id === DEFAULT_PROVIDER_ID)!;
}

/** Convenience — the providers the user can currently use (configured +
 *  premium-gated, if applicable). Used by the AI screen's provider dropdown. */
export function listAvailableProviders(isPremiumUser: boolean): AIProvider[] {
  return PROVIDERS.filter((p) => (p.isPremium ? isPremiumUser : true));
}
