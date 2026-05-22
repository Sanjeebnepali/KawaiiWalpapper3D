# HF error body logging + 403 reason disambiguation

**Date:** 2026-05-19
**Type:** chore (debug-visibility) + fix

## Problem

After change 065's router-endpoint fix, AI logs showed:

```
[ai/huggingface] response status=403 ct=application/json; charset=utf-8
```

The endpoint is now correct (no more HTML 404). But the 403 has
THREE distinct real-world causes, and we had no way to tell them
apart from logcat alone:

1. **Token missing the "Make calls to Inference Providers"
   permission** — HF restructured token permissions in early 2025.
   "Read" tokens don't grant inference-providers access by default
   anymore; users have to explicitly enable that scope when
   creating / editing the token.
2. **Model gated** — `error_type: "model_gated"`. User has to
   accept terms on the model page.
3. **Out of inference credits / no PRO subscription** — for some
   models / providers, free tier hits 0 credits.

The previous 403 branch picked one message ("model needs you to
accept terms") and shipped it for all three cases. Misleads users.

User: "i think i made a mistake while generating the token is it
true" — and they couldn't tell because the in-app toast was the
wrong diagnosis.

## Solution

`lib/ai/providers/huggingface.ts`:

### 1. Capture the response body for every non-2xx

Added a body-peek block right after the breadcrumb log: when the
response is non-OK AND content-type includes `json`, read the body
once into a local `errorBody` string and `console.warn` it. Then
all status-code branches below parse from that captured string
via a shared `parseErrorBody()` helper. Avoids the
"body-stream-already-consumed" bug from re-calling `res.json()`
or `res.text()` twice.

Log line in production:

```
[ai/huggingface] error body: {"error":"…","error_type":"…"}
```

Truncated to 400 chars so a chatty HF response doesn't flood
logcat.

### 2. 403 branch disambiguated

The branch now inspects `error` + `error_type` and routes to one
of four messages based on what HF actually said:

- `error_type === 'model_gated'` OR message contains "gated" /
  "accept" → "Open huggingface.co/{model} → click Accept."
- Message contains "permission" / "scope" / "inference" → "Your
  token needs the 'Make calls to Inference Providers' permission.
  Edit at huggingface.co/settings/tokens."
- Message contains "credit" / "subscription" / "quota" → "Out of
  inference credits. Wait for monthly reset, upgrade to PRO, or
  paste a different token."
- Anything else → echo HF's own error message ("HF refused:
  {error}") instead of guessing.

This change directly answers "did I make a mistake with the token?"
— after the next build, the in-app toast will say so, and the
logcat line will quote HF's exact error string.

### 3. 4xx catch-all fixed to reuse captured body

The generic `if (!res.ok)` block at the bottom used to call
`await res.json()` — which would throw because the body stream is
already locked (consumed by step 1). Switched to `parseErrorBody()`
on the captured string.

### 4. 401 message echoes HF too

Same treatment — when 401 returns a JSON body, surface HF's actual
message instead of the generic "token rejected" toast. Helps the
user distinguish "wrong token" from "token revoked" from "token
expired" without leaving the app.

## Files changed

- `lib/ai/providers/huggingface.ts` — body capture + `parseErrorBody`
  helper + 403/401/4xx-generic branches use captured body.
- `changes/README.md` — index row.

## Verification

`run` to rebuild. Then on the device, retry AI generation.

Expected logcat (one of these flavours):

```
[ai/huggingface] response status=403 ct=application/json; charset=utf-8
[ai/huggingface] error body: {"error":"You don't have permission to call this provider","error_type":"…"}
```

Then the in-app toast will quote a specific fix instead of the
generic terms-acceptance message.

If status is 200 + `ct=image/png` → preview opens normally; no
error body is captured (success path skips it).

## Notes

- **Body is read only once.** The "stream-already-consumed" gotcha
  has historically bitten this file. Centralising the read into
  the post-breadcrumb block (run BEFORE any status branch) is the
  cleanest pattern.
- **No safety-filter regression.** The bottom 4xx catch-all still
  runs the `/nsfw|safety|inappropriate|filtered/i` regex against
  the message, so 422 prompt-filter responses still route to
  `reason: 'safety_filter'`.
- **What we still can't see:** if HF returns a 403 with a
  non-JSON body (HTML, plain text), `errorBody` stays empty and
  the message falls back to the generic "Access denied to
  {model}". Acceptable — that case is rare and the status alone
  is enough to know it's an auth issue.
- **Token rotation note.** Once we see the actual HF error, the
  fix may be: revoke the current token, create a fresh one with
  the right permissions, paste into Settings (or update
  `DEFAULT_HF_TOKEN` for the next build). Specifics depend on
  which of the three 403 flavours we hit.
