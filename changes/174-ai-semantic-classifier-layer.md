# 174 — AI moderation Layer 2: remote semantic classifier

## Problem

Change 173's keyword/heuristic gate (Layer 1) is instant and free but
fundamentally **leaky**: it can't understand paraphrase ("the orange
ex-president"), obfuscation, or any real person / copyrighted character not on
its curated list. The user explicitly chose to add an AI classifier layer for a
stronger "no copyright / no likeness" guarantee.

## Solution

A second moderation layer that asks a small LLM to classify the prompt against
the same policy categories, catching what keywords miss. It runs ONLY on
prompts that already passed Layer 1, so network cost is bounded.

### Provider — verified, not guessed

Pollinations text (free, tokenless, OpenAI-compatible) — the same service the
default image provider uses. Verified the live contract during bring-up:

```
POST https://text.pollinations.ai/openai
  { model, temperature:0, messages:[{role:system,…},{role:user, prompt}] }
-> { choices: [{ message: { content: "{\"allowed\":false,\"category\":\"intellectual_property\"}" } }] }
```

It correctly flagged "studio ghibli + spider-man plush" → `intellectual_property`
and passed "kawaii baby panda…" → allowed. **Observed flakiness:** one call
returned in ~4 s, another timed out at 30 s — which dictated the fail-open
design below.

### `lib/ai/promptClassifier.ts`

- `classifyPrompt(prompt, signal)` — never throws; returns a best-effort
  `ClassifierVerdict`.
- **Fails OPEN** on timeout (9 s cap), HTTP error, malformed reply, or an open
  circuit breaker → `{ allowed: true, skipped: true }`. Layer 1 is the
  always-on floor, so a slow/down free API never bricks a legitimate
  generation; Layer 2 can only ever make moderation *stricter*.
- **Circuit breaker:** after 2 consecutive failures, skip all checks for 3 min
  so a sustained outage doesn't add 9 s to every generation. A user *cancel*
  does not count as a failure.
- Shares the caller's `AbortController`, so "Cancel" aborts the check too.
- `parseClassifierVerdict(content, knownCategories)` — PURE + exported for
  tests. Blocks ONLY when the reply clearly says `allowed:false` AND names a
  recognised category; any ambiguity (no JSON, bad JSON, `allowed` not boolean,
  unknown/`none` category) fails open. Tolerates ```` ```json ```` fences.
- `lib/ai/promptModeration.ts` gains `MODERATION_CATEGORIES` (runtime list) for
  the classifier to validate the model's category string against.

### Wiring

- `hooks/useAiGenerator.ts:onGenerate` — after Layer 1 passes, sets a new
  `checking` state, awaits `classifyPrompt`, and blocks via the SAME animated
  `<ModerationAlert>` if the classifier returns `allowed:false` + a category.
  `checking` is reset in `onCancel` and the `finally`.
- `app/(tabs)/ai.tsx` — the busy button shows **"Reviewing…"** while the
  classifier runs, then "Cancel" during generation.

## Files changed

- `lib/ai/promptClassifier.ts` — NEW. The classifier + pure parser.
- `lib/ai/__tests__/promptClassifier.test.ts` — NEW. 8 parser cases.
- `lib/ai/promptModeration.ts` — `MODERATION_CATEGORIES` export.
- `hooks/useAiGenerator.ts` — Layer 2 + `checking` state.
- `app/(tabs)/ai.tsx` — "Reviewing…" button label.
- `docs/AI_CONTENT_POLICY.md` — documented Layer 2 + the fail-open rationale.

## Verification

- `npm test` → **203 passed** (13 suites). 8 new parser cases: clean
  allowed/blocked, fenced JSON, and fail-open on no-JSON / bad-JSON /
  non-boolean / unknown-category, plus reason-length cap.
- `npx tsc --noEmit` → exit 0.
- Endpoint contract + classification quality verified manually with live calls
  (above). The network call path is not unit-tested (network); the parsing it
  depends on is.

## Notes / honest limits

- The classifier is only as good as the free model + endpoint. Fail-open means
  that during an outage the gate degrades to Layer 1 (keyword) — strict-ish but
  not the full semantic guarantee. For guaranteed latency/uptime, swap in a
  paid/keyed moderation model (noted in `docs/AI_CONTENT_POLICY.md §5`).
- Adds ~3–9 s "Reviewing…" before generation when the endpoint is healthy.
- JS-only; no native rebuild. `run` to embed into the release bundle.
