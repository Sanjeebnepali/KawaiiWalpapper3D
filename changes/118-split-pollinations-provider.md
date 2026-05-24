# Split pollinations provider under the 300-line cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

`lib/ai/providers/pollinations.ts` was 328 lines — over the 300 soft cap. First file
in the "everything over 300" file-size campaign (owner request); chosen as the warm-up
because only the AI client imports it, so blast radius is minimal.

## Solution

Behavior-preserving extraction of pure pieces; the provider object and its
`generateImage` algorithm (rate gate, retry loop, all comments) are untouched.

- `pollinations.models.ts` (new) — `PollModel` type + `POLL_MODELS` catalog + `DEFAULT_MODEL_ID` (pure data).
- `pollinations.io.ts` (new) — `makeAbortError`, abortable `sleep`, `blobToBase64` (pure IO primitives, no module state).
- `pollinations.ts` now imports `{ DEFAULT_MODEL_ID, POLL_MODELS }` and `{ blobToBase64, sleep }` from the two new files.

Public exports of `pollinations.ts` (`pollinationsProvider`, `isUsingPollToken`) are
unchanged, so nothing downstream changes.

## Files changed

- `lib/ai/providers/pollinations.ts` — 328 → **268** lines; removed the data + IO blocks, added two imports.
- `lib/ai/providers/pollinations.models.ts` — new, 20 lines.
- `lib/ai/providers/pollinations.io.ts` — new, 53 lines.

## Verification

`npx tsc --noEmit` → the same 5 pre-existing errors in unrelated files, **0 in any
pollinations file**. No behaviour change (pure data/helper extraction); JS only, no
native rebuild.

## Notes

- `generateImage` is still ~170 lines (over the 80 function cap). Left intact on
  purpose — it's a delicate retry/rate-limit algorithm with module state (`lastRequestAt`)
  and splitting it risks behaviour. Function-cap pass is a separate, careful follow-up.
- Campaign progress: 1 / ~35 files over 300 done.
