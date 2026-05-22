# 104 — OpenAI (DALL·E) + Google Gemini providers, with a provider picker

## Problem

Owner (follow-up to 103): add **ChatGPT (OpenAI/DALL·E)** and **Google Gemini**
as image-generation providers, so a user can paste their own key and generate
**unlimited** (their own billed quota). Selected "Add both".

## Solution

### New providers (each < 300 lines, follow the pollinations template)

- `lib/ai/providers/openai.ts` — DALL·E 3 via `POST /v1/images/generations`
  with `Authorization: Bearer <key>`, `response_format: 'b64_json'`. Maps the
  app's aspect presets onto DALL·E 3's three legal sizes
  (1024² / 1024×1792 / 1792×1024). Errors mapped: 401/403 → `auth_invalid`,
  429 → `rate_limited`, 400+policy → `safety_filter`. Saves the base64 to
  cache and returns the `file://` URI.
- `lib/ai/providers/gemini.ts` — Imagen via the Generative Language API
  `…/models/imagen-3.0-generate-002:predict?key=<key>`, body
  `{ instances:[{prompt}], parameters:{ sampleCount:1, aspectRatio } }`,
  reads `predictions[0].bytesBase64Encoded`. Empty predictions → `safety_filter`
  (Imagen's block behaviour). Same cache-save contract.

Both are **bring-your-own-key**: `isConfigured()` is true only with a key, and
`isPremium: false` (any user can use them with their own key — not gated behind
our premium).

### Wiring

- `lib/ai/types.ts` — added the `'gemini'` provider id (`'dalle'` already
  existed) with doc comments.
- `lib/ai/registry.ts` — registered `openaiProvider` + `geminiProvider`.
- `store/ai.ts` — new persisted token fields `openaiToken` / `geminiToken` +
  `setOpenAIToken` / `setGeminiToken` (mirrors `hfToken` / `pollToken`).
- `lib/ai/client.ts` — `hasUnlimitedGeneration()` now also returns true for
  `dalle`+`openaiToken` and `gemini`+`geminiToken`, so own-key users bypass the
  3/day free cap (per changes 103).

### UI

There was **no provider picker** in the app (`setProviderId` was never called
from the UI — provider was stuck on the default). Added one, plus generalized
the single token row from the old poll-vs-HF binary to all four providers:

- `lib/ai/tokens.ts` (NEW, 81 lines) — `AI_TOKEN_CFG` (per-provider
  placeholder / subtitle / hint / empty-status / clear-label / required key
  prefix) + `setTokenFor(id, value)` (writes the right store field).
- `app/(tabs)/profile.tsx` — AI Generator Settings now has an **"AI Provider"**
  row → `PremiumModal` listing all registered providers → `setProviderId`. The
  key row + bottom sheet are now driven by `activeToken` + `tokenCfg` (no more
  `isPoll` branches). Save validates an optional key prefix (`hf_`, `sk-`).
  Removed the dead `Slider` import and the stale two-token comment.

The AI screen (`app/(tabs)/ai.tsx`) needed no change: it already shows the
active provider name, gates Generate on `provider.isConfigured()`, and (from
103) shows "unlimited (your key)" when a key is set.

## Files changed

- NEW: `lib/ai/providers/openai.ts` (166), `lib/ai/providers/gemini.ts` (147),
  `lib/ai/tokens.ts` (81).
- `lib/ai/types.ts`, `lib/ai/registry.ts`, `lib/ai/client.ts`, `store/ai.ts`
  (284), `app/(tabs)/profile.tsx`.

## Verification

- `npx tsc --noEmit` — clean for every changed/new file. New files all < 300
  lines; `store/ai.ts` 284.
- Manual flow (owner, with real keys — see caveat): Settings → AI Generator →
  AI Provider → pick "ChatGPT (DALL·E 3)" or "Google Gemini (Imagen)" → tap the
  key row → paste key → Save. AI tab shows "unlimited (your key)"; generate.

## Notes / caveat

- **The OpenAI and Gemini network calls are implemented to their documented
  APIs but NOT live-tested** — we have no keys here. The owner must verify with
  real keys. The likely tweak points if something 4xx's: the Gemini model id
  (`imagen-3.0-generate-002`) / endpoint, and that Imagen requires **billing
  enabled** on the Google project; OpenAI image API is **paid** per image. Each
  provider is a single self-contained file, so adjusting the model/endpoint is
  a one-file change.
- Provider selection lives in Settings (next to the key). A picker on the AI
  screen itself could be a later convenience.
- JS-only — `run` to embed; no native recompile.
