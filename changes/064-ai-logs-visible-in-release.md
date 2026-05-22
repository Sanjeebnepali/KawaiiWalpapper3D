# AI provider logs visible in release builds

**Date:** 2026-05-19
**Type:** chore (debug-visibility)

## Problem

User: "what about the ai photo generate log i got problem there."
`adb logcat` for the live app process (PID 27969) showed **zero**
AI-related lines — no request, no response, no error trace. Couldn't
diagnose remotely.

Root cause: every `console.warn` in `lib/ai/providers/huggingface.ts`
and `lib/ai/client.ts` was wrapped in `if (__DEV__) {…}`. In a
release APK (which is what the `run` shortcut builds), `__DEV__`
is `false`, so those calls compile to dead code. The result: AI
failures are silent in production — toast tells the user, nothing
hits logcat.

Same pattern was already noted as a footgun in change 056
(`lib/galleryPicker.ts` promoted its warns out of `__DEV__` for
exactly this reason). Applied the same fix to the AI layer.

## Solution

Three breadcrumbs in `lib/ai/providers/huggingface.ts`, all using
plain `console.warn` (not `__DEV__`-gated):

1. **Request-fire breadcrumb** before the `fetch` call:
   ```
   [ai/huggingface] generate model=stabilityai/... token=default
     promptHead="kawaii cat astronaut..."
   ```
   Shows whether `generateImage` is being called at all + which
   model + whether the user supplied their own token or fell back
   to the embedded default. Token VALUE is never logged — just the
   `user` vs `default` label.

2. **Response-status breadcrumb** before the status-code branches:
   ```
   [ai/huggingface] response status=200 ct=image/jpeg
   ```
   Tells us at a glance whether HF returned the expected `image/*`
   (success) or `application/json` (any error path).

3. **Write-failure log** un-gated. The base64→cacheDirectory write
   was already logged but only in `__DEV__`. Same treatment.

The token value is NEVER part of any of these logs — only the
shape (`user` vs `default`). Prompt is truncated to 40 chars and
double-quotes are escaped so a malicious prompt can't fake out
the log parser.

## Files changed

- `lib/ai/providers/huggingface.ts` — added 2 prod-visible breadcrumb
  `console.warn` lines (request fire, response status); removed
  the one remaining `if (__DEV__)` wrap on the write-failure log.
- `changes/README.md` — index row (added separately).

## Verification

Rebuild (`run` shortcut), then on the device:

```powershell
adb logcat -c
adb logcat -s ReactNativeJS:V *:F
```

In a separate prompt: open the app → AI tab → type a prompt → Generate.

Expected log lines (in order):

```
[ai/huggingface] generate model=stabilityai/stable-diffusion-xl-base-1.0
   token=default promptHead="kawaii cat astronaut, pastel space..."
[ai/huggingface] response status=200 ct=image/jpeg
```

If status is 200 → image landed in cacheDirectory and the preview
screen should open. If status is something else, you have a single
line that tells you the failure mode:
- `status=503` → model cold-starting; UI shows "Retry in Ns".
- `status=401` → token bad; UI sends user to Settings.
- `status=403` → model gated (terms not accepted); UI tells user
  to visit the model page.
- `status=404` → model not on free tier; UI suggests SDXL.
- `status=429` → rate limited; UI tells user to wait.

## Notes

- This change does not fix any FUNCTIONAL bug — it just makes the
  AI layer audible in release builds. The AI feature itself works
  the same; it's now diagnosable when something goes wrong.
- Same pattern (un-gate logs in release) is already in
  `lib/galleryPicker.ts`, `lib/wallpaperActions.ts:saveToGallery`,
  `lib/wallpaperActions.ts:downloadToCache`, and the SW FGS Kotlin
  code. The AI provider was the last big subsystem that was still
  silent in release. Audit candidate for a future pass: any other
  `if (__DEV__) console.warn(...)` in the codebase that wraps a
  legitimate error path.
- Token leakage: deliberately log `user` vs `default` and never the
  token itself. Even though `console.warn` lands in logcat (which
  on stock Android only the app + adb can read), assume any string
  passed to `console.warn` is potentially visible to anyone with
  USB-debugging access to the device.
