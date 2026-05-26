/**
 * Layer 2 of AI prompt moderation — a remote semantic classifier.
 *
 * `moderatePrompt` (Layer 1) is an instant local keyword/heuristic gate; it
 * catches the obvious cases but can't understand paraphrase ("the orange
 * ex-president"), obfuscation, or names/characters not on its list. This
 * layer asks a small LLM to classify the prompt against the same policy
 * categories, catching what keywords miss.
 *
 * It runs ONLY on prompts that already passed Layer 1, so the network cost is
 * bounded. It is deliberately BEST-EFFORT and fails OPEN: on timeout, HTTP
 * error, a malformed answer, or while a circuit breaker is open, it returns
 * `{ allowed: true, skipped: true }` rather than blocking. Rationale — the
 * free text endpoint is observably flaky (a call timed out at 30s during
 * bring-up), and Layer 1 is the always-on floor, so we must never let a slow
 * third-party API brick generation for a legitimate prompt.
 *
 * Provider: Pollinations text (free, tokenless, OpenAI-compatible), the same
 * service the default image provider uses. Verified contract:
 *   POST https://text.pollinations.ai/openai
 *   -> { choices: [{ message: { content: "<json>" } }] }
 */

import { MODERATION_CATEGORIES, type ModerationCategory } from './promptModeration';

const ENDPOINT = 'https://text.pollinations.ai/openai';
/** Small, fast model. Temperature 0 for determinism. */
const MODEL = 'openai-fast';
/** Hard cap on the classifier round-trip. Past this we fail open. */
const TIMEOUT_MS = 9000;
/** After this many consecutive failures, stop calling for COOLDOWN so a
 *  sustained outage doesn't add TIMEOUT_MS to every generation. */
const BREAKER_THRESHOLD = 2;
const BREAKER_COOLDOWN_MS = 3 * 60_000;

export interface ClassifierVerdict {
  allowed: boolean;
  /** Present only when blocked AND the category is a recognised one. */
  category?: ModerationCategory;
  /** Model's short rationale — DEV log only, never shown to users. */
  reason?: string;
  /** True when we failed open (timeout / error / breaker) instead of
   *  getting a real answer. */
  skipped?: boolean;
}

const ALLOW_SKIPPED: ClassifierVerdict = { allowed: true, skipped: true };

const SYSTEM_PROMPT = [
  "You are a strict content-safety classifier for a CHILDREN'S kawaii baby-character wallpaper app.",
  'Decide whether an image-generation prompt is allowed.',
  'BLOCK (allowed=false) if it requests any of these (use as the category):',
  '- intellectual_property: named copyrighted/trademarked characters, brands, logos, recreating famous artwork, or a studio art style by name (e.g. Disney, Ghibli, Pixar).',
  '- real_person: any real identifiable person — celebrity, politician, athlete, influencer — by NAME or by DESCRIPTION (e.g. "the current US president"); deepfakes; real children as reference.',
  '- sexual: nudity, sexual or suggestive content, revealing/inappropriate clothing.',
  '- child_safety: ANYTHING sexualising or endangering a child or minor. Zero tolerance.',
  '- violence: gore, blood, weapons, fighting, war, self-harm, drugs, animal cruelty.',
  '- hate: hateful or extremist symbols, discrimination, mockery.',
  '- illegal: making weapons/drugs/explosives, hacking, trafficking, theft.',
  '- political: propaganda, election/civic-unrest, flag desecration, religious mockery.',
  '- misinformation: fake news, manipulated-photo style, impersonating real organisations.',
  '- horror: genuinely disturbing, grotesque, or occult imagery (CUTE-spooky like a kawaii ghost is fine).',
  'ALLOW (allowed=true, category "none") original cute kawaii characters, animals, food, nature, fantasy, and age-appropriate fashion.',
  'Reply with ONLY compact JSON and nothing else: {"allowed":boolean,"category":string,"reason":string}.',
  'category must be exactly one of the keys listed above, or "none" when allowed.',
].join('\n');

// Module-level circuit-breaker state, shared across the app session.
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

function recordFailure(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
    consecutiveFailures = 0;
  }
}

/**
 * Parse the model's reply into a verdict. PURE + exported for tests.
 *
 * Blocks ONLY when the reply clearly says `allowed:false` AND names a
 * recognised category; any ambiguity (no JSON, bad JSON, unknown category,
 * `allowed` not boolean) fails open.
 */
export function parseClassifierVerdict(
  content: string,
  knownCategories: readonly ModerationCategory[],
): ClassifierVerdict {
  const match = content.match(/\{[\s\S]*\}/); // first JSON object (tolerates ``` fences / prose)
  if (!match) return ALLOW_SKIPPED;

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return ALLOW_SKIPPED;
  }
  if (typeof parsed !== 'object' || parsed === null) return ALLOW_SKIPPED;

  const rec = parsed as Record<string, unknown>;
  if (typeof rec.allowed !== 'boolean') return ALLOW_SKIPPED;
  if (rec.allowed) return { allowed: true };

  const category = knownCategories.find((c) => c === rec.category);
  if (!category) return ALLOW_SKIPPED; // blocked but no usable category → fail open
  const reason = typeof rec.reason === 'string' ? rec.reason.slice(0, 200) : undefined;
  return { allowed: false, category, reason };
}

/**
 * Classify a prompt. Never throws; returns a best-effort verdict.
 *
 * @param signal caller's AbortSignal (user cancel) — combined with the
 *   internal timeout. A user cancel does NOT count as a breaker failure.
 */
export async function classifyPrompt(
  prompt: string,
  signal?: AbortSignal,
): Promise<ClassifierVerdict> {
  if (Date.now() < breakerOpenUntil) {
    if (__DEV__) console.warn('[ai/classifier] breaker open — skipping check');
    return ALLOW_SKIPPED;
  }

  const internal = new AbortController();
  const timer = setTimeout(() => internal.abort(), TIMEOUT_MS);
  const onCallerAbort = () => internal.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: internal.signal,
    });
    if (!res.ok) {
      recordFailure();
      if (__DEV__) console.warn('[ai/classifier] http', res.status);
      return ALLOW_SKIPPED;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      recordFailure();
      return ALLOW_SKIPPED;
    }
    consecutiveFailures = 0; // healthy response resets the failure run
    return parseClassifierVerdict(content, MODERATION_CATEGORIES);
  } catch (e) {
    if (signal?.aborted) return ALLOW_SKIPPED; // user cancel — not a failure
    recordFailure();
    if (__DEV__) console.warn('[ai/classifier] request failed:', e);
    return ALLOW_SKIPPED;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
