# Split huggingface provider under the 300-line cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

`lib/ai/providers/huggingface.ts` was 458 lines — over the 300 soft cap. File 2 of the
file-size campaign. Unlike pollinations, pure-data extraction alone wasn't enough: the
bulk was a ~290-line `generateImage` dominated by HTTP-status error mapping.

## Solution

Behavior-preserving extraction into three files; the request flow + success path stay
verbatim. Error branches were relocated, not rewritten.

- `huggingface.models.ts` (new) — `HFModel` type + `HF_MODELS` registry + `FALLBACK_MODEL_ID` (pure data).
- `huggingface.io.ts` (new) — provider-local `blobToBase64` (kept separate from pollinations' copy per rule of three).
- `huggingface.errors.ts` (new) — `parseHFErrorBody` + `mapHFErrorResponse(res, errorBody, model)`, which holds the 503/401/403/404/429/4xx branches verbatim and returns `null` when `res.ok`.
- `huggingface.ts` now captures `errorBody`, calls `const err = await mapHFErrorResponse(...); if (err) return err;`, then reads the image bytes — identical control flow to the inline version.

Public exports (`huggingfaceProvider`, `isUsingUserHFToken`) unchanged.

## Files changed

- `lib/ai/providers/huggingface.ts` — 458 → **250** lines.
- `lib/ai/providers/huggingface.models.ts` — new, 63 lines.
- `lib/ai/providers/huggingface.io.ts` — new, 25 lines.
- `lib/ai/providers/huggingface.errors.ts` — new, 163 lines.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 in any
huggingface file**. Error-branch logic relocated verbatim (same statuses, same order,
same async body-read fallback in the 503 path). JS only, no native rebuild.

## Notes

- Campaign progress: 2 / ~35 files over 300 done.
- `generateImage` is now ~150 lines (down from ~290) — closer to but still over the 80
  function cap; the remaining length is the request-assembly + success path, left intact.
