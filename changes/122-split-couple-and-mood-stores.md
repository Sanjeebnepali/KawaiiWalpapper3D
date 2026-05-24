# Split couple + mood stores under the 300-line cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

`store/couple.ts` (336) and `store/mood.ts` (380) were over the 300 soft cap. Files
5 & 6 of the file-size campaign. Both are the same store shape: a big type block + a
verbatim `create()` body.

## Solution

Behavior-preserving extraction; both `create()` store bodies, `INITIAL`, selectors,
and `hydrateMoodStore` are verbatim.

**couple:**
- `store/couple.types.ts` (new) — `LinkStatus`/`PartnerProfile`/`CoupleLink`/`ProximityState`/`State`/`Actions`.
- `store/couple.geo.ts` (new) — `recomputeDistance`, `getBufferZone`, `haversineMeters` (the proximity math).
- `store/couple.ts` re-exports the 4 public types + `getBufferZone`/`haversineMeters` so external importers (`lib/couple.ts`, the location task) are unchanged.

**mood:**
- `store/mood.types.ts` (new) — `State` + `Actions` (module-local in the original, so no re-export needed).

## Files changed

- `store/couple.ts` — 336 → **116**; `store/couple.types.ts` (96, new); `store/couple.geo.ts` (149, new).
- `store/mood.ts` — 380 → **281**; `store/mood.types.ts` (102, new).

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 in any
`store/couple*` or `store/mood*` file**. Store logic unchanged; JS only.

## Notes

- Campaign progress: 6 / ~35 files over 300 done (all stores now under cap).
