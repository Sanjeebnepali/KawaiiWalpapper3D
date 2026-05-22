# Pollinations.ai becomes the default AI provider

**Date:** 2026-05-19
**Type:** feature + fix

## Problem

Change 066 finally surfaced HF's actual error body, captured in
the user's next test:

```
[ai/huggingface] response status=403 ct=application/json
[ai/huggingface] error body: {"error":"This authentication method does not have
  sufficient permissions to call Inference Providers on behalf of user Sanju1201"}
```

This is **not** a fixable permission toggle. HF's new pricing
model means "Read" tokens fundamentally cannot access Inference
Providers (where SDXL / FLUX / every popular text-to-image model
now lives). Even a Fine-grained token with the
"Make calls to Inference Providers" scope enabled still requires
the account to have **PRO subscription OR pay-as-you-go credits**
to actually generate.

For the "every user has working AI gen out of the box" promise we
made in change 062, this is a dead end. HF stopped being free for
text-to-image. Period.

## Solution

Add **Pollinations.ai** as a new provider and make it the default.
Pollinations is:

- **Free forever.** No token. No signup. No credits. No paywall
  documented anywhere in their API. Been free since their public
  launch.
- **Quality-equivalent.** Backs FLUX — the same SOTA diffusion
  model HF gates behind paid Inference Providers credits — plus
  three FLUX variants (anime / realism / 3D) and a Turbo model.
- **Simpler protocol.** GET-based, image bytes in the response
  body directly. No JSON request body, no 503 cold-start, no auth
  headers.

### `lib/ai/providers/pollinations.ts` (new)

Implements the `AIProvider` interface. Hits:

```
GET https://image.pollinations.ai/prompt/{encoded-prompt}
    ?width=W&height=H&model=flux&nologo=true&seed=N
```

Returns `image/jpeg`. Saved via the same
`blob → base64 → FileSystem.writeAsStringAsync → cacheDirectory`
pipeline the HF provider uses, so downstream consumers
(preview screen, save-to-gallery, set-as-wallpaper, mood-pool
add) see a canonical `file://` URI exactly like before.

`isConfigured()` returns `true` unconditionally — no token to
validate. New installs work the moment the APK lands.

Prod-visible breadcrumbs (`[ai/pollinations] generate …` and
`[ai/pollinations] response status=…`) match the HF provider's
naming so the diagnostic recipe (`adb logcat | findstr
"ai/"`) catches both.

### `lib/ai/types.ts`

Added `'pollinations'` to the `AIProviderId` union. HF moves down
in priority comments — kept in the union because users with paid
HF accounts can still use it (the codebase keeps the HF provider
intact; only the default switches).

### `lib/ai/registry.ts`

Pollinations is now at position 0 of the `PROVIDERS` array. The
order matters because `getProvider()` falls back to the first
entry when the persisted id is unknown / blank. `DEFAULT_PROVIDER_ID`
constant flips to `'pollinations'`.

The HF provider stays in the array — anyone who pasted a working
HF token doesn't lose access. Premium-tier paid providers
(DALL-E, Stability) will go after it in the same pattern.

### `store/ai.ts`

`DEFAULTS.providerId` flips to `'pollinations'`. New installs read
this; that's the easy path.

For EXISTING installs that already persisted `providerId:
'huggingface'`, `hydrate()` now runs a one-shot migration:

- If the persisted `providerId === 'huggingface'` AND there's no
  user-supplied `hfToken` (so they were relying on the embedded
  default which is provably broken now), the migration silently
  swaps them to `'pollinations'` and re-persists the change.
- Users who DID paste their own HF token (e.g., a working paid
  account) keep `'huggingface'` — their choice is intentional,
  the migration doesn't fight it.

The migration runs once at hydrate time and the result is
written back to storage so the next launch doesn't re-do it.

## Files changed

- `lib/ai/providers/pollinations.ts` (new) — the provider.
- `lib/ai/types.ts` — `'pollinations'` added to `AIProviderId`.
- `lib/ai/registry.ts` — registered at position 0, set as
  `DEFAULT_PROVIDER_ID`.
- `store/ai.ts` — `DEFAULTS.providerId` flipped + one-shot
  hydrate migration for existing HF-on-default installs.
- `changes/README.md` — index row.

## Verification

JS-only — `run` to rebuild.

1. **Fresh install (or after the migration kicks in):**
   - AI tab → type "kawaii cat astronaut" → Generate.
   - Expected:
     ```
     [ai/pollinations] generate model=flux promptHead="kawaii cat astronaut"
     [ai/pollinations] response status=200 ct=image/jpeg
     ```
   - Preview screen opens with a generated image, no token alert,
     no Settings prompt, no friction.
2. **Header on AI tab** reads "Pollinations · N generated today"
   instead of "Hugging Face · …".
3. **Existing HF token user (manual override):** the migration
   detects the user-supplied token and keeps `providerId:
   'huggingface'`. They still get the HF path. If their token has
   working Inference Providers credit, that path works; if not,
   they get the same 403 alert flow with the Edit-at-HF
   deep-link.

## Notes

- **Adding paid providers later:** still the documented promise.
  1 new file in `lib/ai/providers/`, 1 line in `registry.ts`, no
  edits to the screen or the client. Pollinations setting the
  pattern as a no-token provider proves the abstraction is
  flexible enough to cover both auth and no-auth flows.
- **Why not REMOVE the HF provider?** Users who legitimately have
  PRO subscriptions can still use it for SDXL output style they
  prefer. Keeping it costs nothing — the broken default just stops
  being the default.
- **Pollinations reliability:** the service has been online and
  free since 2023 and is widely used in third-party apps. They
  have a queue under heavy load (you wait longer, you don't fail)
  — the `429` branch is defensive in case that ever changes.
- **`DEFAULT_HF_TOKEN` in `lib/ai/defaults.ts`** is still the
  current leaked-in-chat value. Anyone who manually switches
  back to HF without pasting their own token would still hit the
  same 403. That's not a regression — those users had a non-
  working setup anyway and now have an obvious working alternative
  one tap away.
- **Model picker UI is still TODO.** Pollinations has 5 models
  (`flux`, `turbo`, `flux-anime`, `flux-realism`, `flux-3d`);
  defaulting to `flux`. A Settings dropdown to switch between
  them — plus between providers — is the natural next UI pass.
