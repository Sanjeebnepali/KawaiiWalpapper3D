# Parallel split of 5 lib/constants files under the cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

Five logic files remained over the 300 soft cap: `lib/moodHistory.ts` (605),
`lib/couple.ts` (581), `constants/mockData.ts` (474), `lib/moodBackgroundTask.ts` (340),
`hooks/useShuffleEngine.ts` (321). Files 10–14 of the file-size campaign.

## Solution

Done in parallel by four sub-agents, each on a DISJOINT file (no shared edits), then
verified centrally with one `tsc` run and committed here. Every split is
behaviour-preserving (code moved verbatim, public exports re-exported so importers are
unchanged), no circular imports, no moved module-load side effects, no changed React
hook order.

- **moodHistory.ts 605→176** — types → `moodHistory.types.ts` (46); AsyncStorage primitives → `moodHistory.storage.ts` (134); mode load/save → `moodHistory.persistence.ts` (316, see exception). Main keeps history concern + re-exports all 29 public symbols.
- **couple.ts 581→259** — `couple.codes.ts` (53, code-format/RPC-error helpers), `couple.hydration.ts` (192, cold-start reads), `couple.realtime.ts` (141, realtime channel). Write/linking orchestrator + re-exports stay.
- **mockData.ts 474→273** — split into 6 data/concern siblings (`tokens` 21, `types` 13, `formats` 93, `couple` 21, `mood` 34, `search` 63). Home-feed concern + photo resolvers stay (resolvers depend on the module-local `featured` array — kept to avoid a cycle).
- **moodBackgroundTask.ts 340→233** — native-module types → `moodBackgroundTask.types.ts` (23); sleep/wake fallback → `moodSleepWakeFallback.ts` (95). `ensureTaskDefined()` module-load side effect stays in main.
- **useShuffleEngine.ts 321→215** — `EngineStatus` → `shuffleEngine.types.ts` (4); the pure non-hook apply pipeline (`applyNext`/`isInDndWindow` + the module-level `applyInFlight` mutex) → `shuffleApply.ts` (111). Both hooks stay in the main file, untouched.

## Files changed

5 mains trimmed + 16 new sibling files (see counts above).

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 new** across all
21 touched/created files. JS only, no native rebuild.

## Notes

- **Justified exception:** `lib/moodHistory.persistence.ts` is 316 (over the 300 soft
  cap, under the 500 hard cap). Its 20 module-level `mem*` mode-fallback vars and the
  `memSnapshot()` reader that aggregates them are written/read by the 21 `save*` /
  `loadMoodMode` functions; splitting them would require routing every `memX` access
  through a shared state object — a logic rewrite, which violates behaviour-preservation.
  Kept whole intentionally.
- Campaign progress: 14 / ~35 files over 300 done. Batch A logic is now essentially
  complete; remaining: `moodNotifications.ts` (786) + `moodBootstrap.ts` (527) as
  documented hard exceptions, then Batch B (19 screens).
