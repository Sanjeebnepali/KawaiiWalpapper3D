# HF endpoint switched to router + pool footer safe-area

**Date:** 2026-05-19
**Type:** fix

## Problem

Two bugs surfaced from the live device once we got logs visible
(change 064):

1. **AI generation 404s with HTML body.** Logcat captured:
   ```
   [ai/huggingface] generate model=stabilityai/stable-diffusion-xl-base-1.0
     token=default promptHead="Kawaii baby astronaut floating in pastel"
   [ai/huggingface] response status=404 ct=text/html; charset=utf-8
   ```
   Key signal: content-type is `text/html`, not JSON. That's a
   routing-layer 404 (CDN / load-balancer), NOT a model-not-found
   404 from the HF inference engine. The legacy
   `api-inference.huggingface.co/models/{model}` URL was
   deprecated in HF's late-2024 / 2025 API restructure; the
   path is now served from their new "Inference Providers"
   router. Every model 404s on the old host.
2. **"Add photos" button clipped by phone nav bar.** User:
   "in the user select image can you make it responsive for not
   the add photo button hide in between navigation phone button."
   The bottom-action-bar in `/mood/pool/[id]` was positioned with
   a static `paddingBottom: Spacing.lg` (24 px), but on Vivo /
   MIUI devices with the gesture pill or 3-button nav the
   system UI eats ~30–50 px from the bottom — the button ended
   up partly behind it.

## Solution

### 1. New HF endpoint

`lib/ai/providers/huggingface.ts`:

```ts
// before
const ENDPOINT = 'https://api-inference.huggingface.co/models/';

// after
const ENDPOINT = 'https://router.huggingface.co/hf-inference/models/';
```

Same auth (`Authorization: Bearer hf_…`), same request body
(`{ inputs, parameters }`), same response shape (binary image
bytes on 200, JSON `{ error, estimated_time }` on 503). Only the
host + path prefix changes. All status-code branches below still
apply unchanged.

Top-of-file comment block documents the deprecation history so the
next reader knows why the path changed and where to look if HF
moves again (their `docs/inference-providers` is the source of
truth for the current path).

Also tightened the 404 branch to distinguish:
- **HTML 404** (`Content-Type: text/html`) → "Hugging Face changed
  their API path again. Update needed — please report this to the
  app maintainer." Tells the user the URL is wrong, not the model.
- **JSON 404** (`Content-Type: application/json`) → original
  message: "model isn't on free tier, switch to SDXL." Still
  correct for genuine model-missing 404s.

### 2. Pool screen footer safe-area

`app/mood/pool/[id].tsx`:

- Imported `useSafeAreaInsets` from `react-native-safe-area-context`
  alongside the existing `SafeAreaView`.
- Read `insets.bottom` inside the component.
- Footer view now sets `paddingBottom` inline as
  `insets.bottom + Spacing.md`. The static `paddingBottom:
  Spacing.lg` was removed from the StyleSheet entry (the
  comment in the StyleSheet now points readers at the inline
  override so they don't add a static one back).

Why not just wrap the footer in `SafeAreaView edges={['bottom']}`:
the footer is `position: 'absolute'` and SafeAreaView's
inset-adding works best on layout-flow children. The inline-style
approach is the pattern used elsewhere in the app
(`components/CustomTabBar.tsx` does the same) and it composes
cleanly with the absolute positioning.

## Files changed

- `lib/ai/providers/huggingface.ts` — `ENDPOINT` constant points
  at the router; top-of-file doc block now explains the
  deprecation; 404 branch splits on content-type for a more
  helpful error message.
- `app/mood/pool/[id].tsx` — `useSafeAreaInsets` import + hook
  call; footer paddingBottom set inline; static padding removed
  from the StyleSheet entry with a forwarding comment.
- `changes/README.md` — index row.

## Verification

JS-only. Type `run` (or `npx expo start --clear`) to rebuild.

After install:

1. **AI generation works:**
   - AI tab → type "kawaii cat" → Generate.
   - Expected logcat:
     ```
     [ai/huggingface] generate model=stabilityai/... token=default ...
     [ai/huggingface] response status=503 ct=application/json     ← cold start
     ```
     Tap the "Retry in Ns" dialog. Next round should be:
     ```
     [ai/huggingface] response status=200 ct=image/jpeg
     ```
     Preview screen opens with the generated image.

2. **Pool footer clears the nav bar:**
   - Mood → bottom strip → "Build full album…" → "Create your
     own pool" → empty pool screen.
   - **Expected:** "Add photos" button sits ~12 px above the
     OS gesture pill / 3-button nav. No clipping. Tap area
     fully reachable.

## Notes

- **If status=200 still doesn't return an image:** check `ct=`.
  If it's `application/json` on a 200, HF's response format
  changed and we'd need to inspect the body. So far the router
  endpoint serves binary `image/png` or `image/jpeg` exactly the
  same as the legacy one.
- **Token still works unchanged.** The router endpoint accepts
  the same `Bearer hf_…` token. No re-paste needed; existing
  `DEFAULT_HF_TOKEN` (and any user override in
  `useAIStore.hfToken`) keeps working.
- **Other consumers of `api-inference.huggingface.co`:** none in
  this codebase — only `huggingface.ts` knows about HF URLs.
  Future providers (DALL-E, Stability) won't be affected.
- **Followup: a model picker UI.** The store already has
  `hfModelId` and the provider exposes `availableModels`. After
  this fix lands, surfacing a Settings dropdown to let users
  switch between SDXL / SD 1.5 / SD 2.1 / FLUX (premium) is the
  next obvious feature. Tracked informally — not blocking.
- **Pool footer on iPhones:** `useSafeAreaInsets` returns the
  home-indicator height on iOS too, so the same code handles
  the iPhone bottom gesture inset without an `if Platform.OS`
  branch.
