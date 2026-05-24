# Split AI store under the 300-line cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

`store/ai.ts` was 324 lines — over the 300 soft cap. File 3 of the file-size campaign.

## Solution

Behavior-preserving extraction; the `create<AIStore>` store body, `DEFAULTS`, and
`hydrateAIStore` are verbatim.

- `store/ai.types.ts` (new) — `HISTORY_LIMIT` + `AIGeneration` / `AIState` / `AIStore` types.
- `store/ai.persistence.ts` (new) — `PERSIST_KEY`, `getStorage`, `schedulePersist`, `localDayKey` (lazy AsyncStorage + debounced write).
- `store/ai.ts` imports both and **re-exports** `HISTORY_LIMIT` + the types so the public surface is unchanged (verified: external files only import `useAIStore`/`hydrateAIStore`, but re-exporting keeps the API stable regardless).

## Files changed

- `store/ai.ts` — 324 → **190** lines.
- `store/ai.types.ts` — new, 109 lines.
- `store/ai.persistence.ts` — new, 49 lines.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 in any
`store/ai*` file**. Store logic unchanged; JS only.

## Notes

- Campaign progress: 3 / ~35 files over 300 done.
- `lib/moodNotifications.ts` (786) deferred: it's a single subsystem with shared mutable
  module state + a load-order-sensitive `maybeRegister()` side effect; a mechanical split
  creates circular schedule↔response imports. Needs a state-object restructure or a
  justified-exception, handled carefully later.
