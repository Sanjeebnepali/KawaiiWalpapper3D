# AI: embedded default HF token + FLUX 404 fix

**Date:** 2026-05-19
**Type:** fix + feature

## Problem

Two issues after 061 shipped:

1. **404 from Hugging Face on every generation.** The provider
   defaulted to `black-forest-labs/FLUX.1-schnell`, which Hugging
   Face pulled from their free serverless Inference API in late
   2024 (moved behind paid "Inference Providers"). The legacy
   endpoint `api-inference.huggingface.co/models/black-forest-labs/
   FLUX.1-schnell` now returns **404 Not Found** for free-tier
   tokens. Bug surface: the user's first generation died with a
   generic "Hugging Face returned 404" toast and no path forward.
2. **Token-paste flow is a friction wall for non-technical users.**
   User: "what i want is that set my hugging face api as defult
   for everyuser and in setting they have option to set their own
   ai generated api so in later if they want to integrate their
   own ai for getting better result… this will be best for those
   who don't know how to add api." The 061 design required EVERY
   user to register at huggingface.co, generate a token, paste it
   in. Onboarding friction so high that most users would never
   reach a generation.

## Solution

### 1. Switch the default model to SDXL (fix the 404)

`lib/ai/providers/huggingface.ts`:`HF_MODELS` reordered.
`stabilityai/stable-diffusion-xl-base-1.0` moves to position 0 — it
IS reliably available on the free serverless tier, no terms
acceptance, and produces wallpaper-friendly 1024×1024 output. FLUX
stays in the list with a `· needs paid plan` suffix in its
display name so users with credits / paid HF plans can still pick
it; the 404 surfaces a clear "isn't available on free, switch
model" message rather than a flat error.

New status-code handling in `generateImage`:
- **403 → `auth_invalid` w/ model-specific message** — gated
  models (some FLUX / SDXL fine-tunes require visiting the model
  page and clicking Accept). Message names the model and links
  the path.
- **404 → `unknown` w/ "switch model" message** — model not on
  free tier. Toast tells the user to switch to "Stable Diffusion
  XL" in Settings.

### 2. Two-token model (default + user override)

New file `lib/ai/defaults.ts`:

```ts
export const DEFAULT_HF_TOKEN = 'hf_…';
export const DEFAULT_HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0';
```

The token gets baked into the APK at build time. Users who do
NOTHING get a working AI generator out of the box. The
`isConfigured()` check now passes for clean installs because
`effectiveToken()` falls back to `DEFAULT_HF_TOKEN` when the user
hasn't set one.

`lib/ai/providers/huggingface.ts` exports a new `isUsingUserHFToken()`
helper so the UI can render different states for default-vs-custom
without each call site re-implementing the precedence logic.
`effectiveToken()` (private) is the single resolution point —
every code path (call + isConfigured + UI hint) reads through it.

Security caveats are written into `lib/ai/defaults.ts`'s top
comment block at length. Summary:
- Anyone with the APK can extract the embedded token (decompiling
  is trivial).
- HF free tier (~30k req/month per token) can absorb modest
  abuse; rotating is cheap.
- ⚠️ NEVER embed paid keys (OpenAI / Stability / Replicate) with
  this pattern — they'll get drained and you pay the bill. Use a
  backend proxy for those.
- Comment in `DEFAULT_HF_TOKEN` documents the current value's
  exposure history (leaked in chat on 2026-05-19) and instructions
  to rotate.

### 3. Settings UI shows the two-token state

`app/(tabs)/profile.tsx`:
- The AI token Settings row's right-side text now reads:
  - `"hf_…foc"` (masked user token) when user supplied one
  - `"App default"` when relying on the build-time default
  - `"Not set"` when both are blank
- The bottom-sheet subtitle adapts:
  - With a default available: "You can skip this — the app ships
    with a working token. Add your own here for higher quota /
    better results on your own account."
  - Without: "Paste your token to enable image generation."
- New "Active" pill at the top of the sheet body shows which
  token is currently in effect (user vs default vs none) with an
  appropriate icon.
- The Clear button is labeled "Use default" when a default is
  available, "Clear" when not. Toast adjusts to match.

## Files changed

- `lib/ai/defaults.ts` (new) — build-time defaults + security
  notes.
- `lib/ai/providers/huggingface.ts` — reordered HF_MODELS (SDXL
  first), `effectiveToken()` helper + `isUsingUserHFToken()`
  export, 403 / 404 status branches with model-specific messages.
- `app/(tabs)/profile.tsx` — token row right-side reads
  `tokenStatus` (3-state), sheet subtitle adapts to whether a
  default exists, new "Active" pill at sheet top, Clear button
  becomes "Use default", new `aiTokenStateRow` / `aiTokenStateText`
  styles.
- `changes/README.md` — index row.

## Verification

JS-only — no native rebuild required, though the next `run`
shortcut will re-embed the default token into a fresh APK.

```powershell
npx expo start --clear
```

Test matrix:

1. **Clean install (no user token):**
   - AI tab → type prompt → Generate.
   - Expected: SDXL warms up (~30s first time, ~5s after), preview
     opens with a generated image. No "paste your token" prompt
     anywhere.

2. **Settings sheet — default state:**
   - Profile → AI Generator Settings → token row right-side
     reads `"App default"`.
   - Tap row → sheet opens with subtitle starting "You can skip
     this…" and the "Active: app default" pill at the top.

3. **Settings sheet — user override:**
   - Paste a custom `hf_…` token → Save.
   - Right-side reads the masked user token.
   - Reopen sheet → "Active: your token (hf_…last4)" pill shows.

4. **Revert to default:**
   - Open sheet with a user token set → tap "Use default" → toast
     `"✓ Reverted to app default"`. Right-side text on the row
     flips to `"App default"`.

5. **FLUX still in the dropdown:**
   - (Once the model picker UI is wired) Picking FLUX-schnell →
     Generate.
   - Expected: 404 toast `"Model 'black-forest-labs/FLUX.1-schnell'
     isn't available on the free Hugging Face tier. Switch to
     'Stable Diffusion XL' in Settings…"` — informative, not a
     dead end.

## Notes

- **Default token rotation.** The current value in
  `DEFAULT_HF_TOKEN` was first pasted in chat on 2026-05-19 and
  must be treated as semi-public. Recommended action: go to
  huggingface.co/settings/tokens, revoke the leaked token, create
  a new Read token, paste the new value into `lib/ai/defaults.ts`,
  rebuild + push an update.
- **Quota under the embedded default.** All users of an install
  share one HF account's free quota (~30k req/month combined). If
  the app gains traction this WILL bottleneck — the BYOK pattern
  (user pastes their own token) is the escape hatch. Future
  follow-up: surface a "you're sharing the app default — get
  your own free token here for unlimited" nudge after the user
  hits a ratelimit response.
- **Picking a different default model.** Editing
  `DEFAULT_HF_MODEL` in `defaults.ts` changes the new-install
  default. Existing installs keep whatever's persisted in their
  `hfModelId` field (empty string = use default), so a default
  change is non-disruptive.
- **Model picker UI is still pending.** The provider exposes
  `availableModels` and reads `hfModelId` from the store, but
  there's no UI yet to flip between SDXL / SD 1.5 / SD 2.1 /
  FLUX. The store field works if set programmatically; a Settings
  row + bottom-sheet picker is the natural next step.
- **The 403 path** assumes HF returns plain 403 for gated models.
  In practice some gated models return 401 with a body referring
  to terms; the catch-all 401 branch (kept above 403) will pull
  those into `auth_invalid` with the generic "token rejected"
  message instead of the more accurate "accept terms" one.
  Acceptable for now; refine if a user reports the wrong message.
