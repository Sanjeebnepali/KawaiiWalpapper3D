# Split shuffle store under the 300-line cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

`store/shuffle.ts` was 334 lines — over the 300 soft cap. File 4 of the file-size
campaign. (Its persisted state shape already lives in `constants/shuffle.ts`.)

## Solution

Behavior-preserving extraction; `create<ShuffleStore>` body, selectors, and
`hydrateShuffleStore` are verbatim. Seams chosen to avoid circular imports.

- `store/shuffle.types.ts` (new) — the `Actions` surface + `ShuffleStore` type.
- `store/shuffle.persistence.ts` (new) — `STATE_FILE`, debounced `schedulePersist`, `genId`.
- Selectors (`useCollections`, `useActiveCollection`, …) stay in `store/shuffle.ts` — moving them would create a `shuffle ↔ selectors` cycle.

## Files changed

- `store/shuffle.ts` — 334 → **253** lines.
- `store/shuffle.types.ts` — new, 65 lines.
- `store/shuffle.persistence.ts` — new, 37 lines.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 in any
`store/shuffle*` file**. Store logic unchanged; JS only.

## Notes

- Campaign progress: 4 / ~35 files over 300 done.
