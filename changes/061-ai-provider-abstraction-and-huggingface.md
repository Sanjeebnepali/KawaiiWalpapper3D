# AI image generation — provider abstraction + Hugging Face

**Date:** 2026-05-19
**Type:** feature

## Problem

User asked for a working AI image generator backed by the
Hugging Face Inference API, architected so adding paid providers
(DALL-E, Stability, Midjourney) later is a drop-in addition that
doesn't touch existing code. The existing `app/(tabs)/ai.tsx` was a
stub with a `// TODO: actual generation request goes here` and no
backend wiring.

## Solution

Built a clean **provider abstraction** under `lib/ai/`. Every
provider implements the same `AIProvider` interface; the UI calls
a single `generateImage(req, signal)` entry point that dispatches
to whichever provider id is active in the store. Adding a new
provider is now: 1 new file in `lib/ai/providers/` + 1 line in
`lib/ai/registry.ts`. The screen, the client, and the other
providers don't change.

### `lib/ai/types.ts` — the contract

`AIProvider` is the interface every provider implements. Five
fields:
- `id` / `displayName` / `description` / `isPremium` — UI metadata.
- `defaultModel` / `availableModels` — what the screen shows in the
  model dropdown.
- `isConfigured()` — "do I have what I need to make a call right
  now?" The AI screen reads this to grey out the Generate button.
- `generateImage(req, signal)` — the actual call. Returns a
  discriminated union: `{ ok: true, localUri, durationMs, …}` on
  success, `{ ok: false, reason, message, retryAfterMs? }` on
  failure. Providers MUST return error objects rather than throw
  on any KNOWN failure mode (auth, rate limit, model loading,
  network, safety filter, cancel).

`ImageGenRequest` carries `prompt`, optional `negativePrompt`,
`aspect`, `seed`, `steps`, `guidanceScale`, plus an `extra` field
for provider-specific knobs. Aspect ratios resolve to pixel sizes
via `aspectToSize(aspect)`.

### `lib/ai/providers/huggingface.ts` — first provider

Hits `https://api-inference.huggingface.co/models/{model}` with the
user's `hf_…` token from `useAIStore`. Default model:
`black-forest-labs/FLUX.1-schnell` (fast distilled diffusion, 4
steps, guidance 0). Two alternative models registered (SDXL,
SD 1.5) — user picks via Settings.

Per-model defaults live in a local `HF_MODELS` array so the
provider can apply the right `steps` / `guidanceScale` without the
UI needing to know which model wants what. The `acceptsSize` flag
on each row controls whether `width` / `height` are added to the
request — some HF wrappers ignore them, documented here so we
don't waste bytes.

Status-code handling:
- **200** — binary image bytes. Read as base64 via FileReader →
  `FileSystem.writeAsStringAsync` into `cacheDirectory`. Returns
  the `file://` URI in `localUri`. No base64 / blob ever crosses
  the bridge into JS in component land — that's 3× the memory of
  the on-disk URI.
- **503** — model cold-start. Parses `estimated_time` from the
  JSON body, returns `{ ok: false, reason: 'model_loading',
  retryAfterMs }`. UI translates this to a "Retry in Ns" button.
- **401/403** — `auth_invalid` (token rejected). UI bounces user
  to Settings.
- **429** — `rate_limited` with optional `Retry-After`.
- **4xx generic** — parses JSON `error` field, crude regex on
  `nsfw|safety|inappropriate|filtered` to set `safety_filter`
  reason.
- **AbortError** — `cancelled`, surfaces as a silent "Generation
  cancelled" toast.

### `lib/ai/registry.ts` + `lib/ai/client.ts`

`registry.ts` is the one-line surface for adding providers:
import the new provider, push it onto `PROVIDERS`. The `getProvider(id)`
helper resolves a stable id to the provider object with a fallback
to `huggingface` so call sites never need nil checks.

`client.ts` exports `generateImage(req, signal)` — the only entry
point the UI calls. Resolves the active provider, delegates the
call, records successful results in history via
`useAIStore.recordGeneration`. Wraps in try/catch to enforce the
"providers return errors, don't throw" rule — anything that
escapes lands here as an `unknown` ImageGenError.

### `store/ai.ts` — Zustand store

Mirrors `store/settings.ts`'s persistence pattern:
- Lazy-required `@react-native-async-storage/async-storage` so the
  store still works pre-rebuild.
- Debounced writes (200 ms) so a fast-typed token doesn't burn the
  bridge.
- Idempotent `hydrate()` called from `app/_layout.tsx` bootstrap.

State surface:
- `hfToken` — pasted token; `setHFToken(t)` trims + persists.
- `hfModelId` — selected model id (empty string = use provider
  default).
- `providerId` — active provider; default `'huggingface'`.
- `history` — last `HISTORY_LIMIT` (30) generations with prompt,
  model, local URI, timestamp.
- `todayCount()` — derived counter for the per-day quota label.
- `resetAll()` — single-button wipe (token + history + provider
  reset) for users who want to scrub before lending the phone.

Token storage is **on-device only** — never logged, never sent
anywhere except the Hugging Face Inference API. If the user shares
a phone, a single "Reset all AI data" call clears it.

### `app/(tabs)/ai.tsx` — screen rewrite

Replaced the 97-line stub. New layout: prompt input (multiline,
`KeyboardAvoidingView`), aspect chip row (1:1 / 9:16 / 3:4 /
16:9), Surprise-me dice (cycles a 4-item suggestions list), and a
Generate button that flips into a Cancel button + spinner while
busy. AbortController binds to the in-flight request so leaving
the screen aborts cleanly.

Error UX:
- `auth_missing` / `auth_invalid` → `premiumAlert` with "Open
  Settings" button.
- `model_loading` → `premiumAlert` "Retry in Ns" that re-invokes
  generate after `retryAfterMs`.
- Everything else → flat toast.

Below the prompt box:
- Token-missing hint (gold pill) that taps through to Settings.
- Quick-starts (suggestion chips).
- Recent generations strip — horizontal `ScrollView`, 10 thumbs
  max, taps route to `/ai/preview` with the historical URI.

### `app/ai/preview.tsx` — result preview

Mirrors the wallpaper-preview UX users already know from
`app/wallpaper/[id].tsx`. Full-screen image + prompt block + 5
action buttons at the bottom:
- **Save** — `saveToGallery` honouring the `featuredFolder` setting.
- **Set** — `premiumAlert` with Lock / Home / Both → `setAsWallpaper`.
- **To pool** — append to the user's mood-purpose collection with
  the same dedupe + sliding-window eviction the Custom flow uses.
  If no mood pool exists, bounces to `/mood/pick-collection`.
- **Retry** — `router.replace('/(tabs)/ai', { prompt })` to
  pre-fill the input.
- **Discard** — no-op except popping back; the cache file is
  evicted naturally by the AI store's history cap and the OS's
  cacheDirectory rotation.

The image URI / prompt / model / duration flow through search
params so the preview has zero dependence on the AI store — it
works for both fresh generations and history taps.

### `app/(tabs)/profile.tsx` — Settings row + bottom sheet

Added a new SettingsRow as the FIRST item under "AI Generator
Settings" — surfaces `{providerName} token` with the masked value
(`hf_…foc`) on the right. Tap opens a `PremiumSheet` (62% snap)
containing:
- Multiline `TextInput` with monospace font (so tokens are
  legible) and `secureTextEntry: false` for paste-and-verify UX.
- "Paste from clipboard" pill button using `Clipboard.getStringAsync`.
- Hint linking to huggingface.co/settings/tokens.
- Save / Clear button pair. Save validates `hf_` prefix before
  persisting.

### `app/_layout.tsx`

Two lines: `<Stack.Screen name="ai/preview" />` next to the other
non-tab routes; `void hydrateAIStore()` in the bootstrap effect
next to `bootstrapMoodFeature()` and the auth bootstrap.

## Files changed

- `lib/ai/types.ts` (new) — interface + request/response types.
- `lib/ai/providers/huggingface.ts` (new) — HF Inference API impl.
- `lib/ai/registry.ts` (new) — one-line provider registration.
- `lib/ai/client.ts` (new) — public `generateImage` entry point.
- `store/ai.ts` (new) — token / provider / history store.
- `app/(tabs)/ai.tsx` — full rewrite from the stub.
- `app/ai/preview.tsx` (new) — full-screen result preview.
- `app/(tabs)/profile.tsx` — AI token Settings row + bottom sheet.
- `app/_layout.tsx` — route registration + AI store hydrate.
- `changes/README.md` — index row.

## Verification

JS-only — no native rebuild. Reload via:

```powershell
npx expo start --clear
```

If Metro keeps serving stale errors after the new route files,
follow `CLAUDE.md → "Metro stale-worker gotcha"`.

On the device:

1. **Token paste:**
   - Profile tab → AI Generator Settings → "Hugging Face token" row.
   - Bottom sheet opens. Paste `hf_…` token (or use Paste from
     Clipboard pill). Save.
   - Expected: toast "✓ Token saved", row right-side updates to
     `hf_…last4`.
2. **First generation:**
   - AI tab → type a prompt → pick 9:16 aspect → Generate.
   - Expected: button flips to Cancel + spinner. ~5–30 sec later
     (FLUX-schnell warm cache vs cold start), preview screen
     opens with the generated image.
   - First call after a long idle: `premiumAlert` "Model is
     waking up — Retry in Ns" appears. Tapping it queues an
     auto-retry.
3. **Preview actions:**
   - Save → toast "✓ Saved to gallery".
   - Set → Both → toast "✓ Applied to lock + home".
   - To pool → if a mood pool exists, image appears in it; else
     bounces to /mood/pick-collection.
   - Retry → returns to AI tab with prompt pre-filled.
4. **Recent strip:**
   - Generate 2–3 images → AI tab shows them in a horizontal
     thumbnail row. Tap → preview.

## Notes

- **Token is on-device only.** Stored in AsyncStorage under
  `@kawaii/ai@v1`, never logged, never sent except as the
  `Authorization: Bearer hf_…` header to
  `api-inference.huggingface.co`. If the token is leaked (e.g.
  shared in a screenshot), users can revoke it at
  huggingface.co/settings/tokens and paste a fresh one.
- **Adding DALL-E later is a 3-step add:**
  1. Create `lib/ai/providers/dalle.ts` exporting an `AIProvider`.
  2. Add `dalleProvider` to the `PROVIDERS` array in
     `lib/ai/registry.ts`.
  3. (Optional) Add a `dalleToken` field + setter to
     `store/ai.ts`. The AI screen reads
     `provider.isConfigured()` so it picks up the new check
     automatically. The Settings row uses the active provider's
     display name, so it relabels for free.
- **FLUX-schnell quirks documented in
  `lib/ai/providers/huggingface.ts:HF_MODELS`** — `defaultSteps:
  4`, `defaultGuidance: 0`. Don't override these from the UI
  without understanding the distillation contract.
- **Cancel works** — AbortController bound to the `fetch`; the
  provider returns `{ reason: 'cancelled' }` which the screen
  suppresses (no toast on user-initiated cancel).
- **Daily quota gating** — `useAIStore.todayCount()` is computed
  but not currently enforced. Wire it into the Generate handler
  if you want a hard cap (e.g. `if (todayCount() >= maxGenPerDay)
  return toast('Daily quota reached')`).
- **Image storage** — generations land in `cacheDirectory` so the
  OS will eventually evict them. Users who want to keep an image
  must tap Save → moves into the gallery permanently. This is
  intentional — the cache is the staging area, not the archive.
