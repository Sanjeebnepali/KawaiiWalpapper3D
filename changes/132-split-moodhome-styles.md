# Split moodHome styles under 300 (final safe reduction)

**Date:** 2026-05-24
**Type:** refactor

## Problem

`components/moodHome/styles.ts` (628) was the last *safely-splittable* file over the 300
cap — a pure `StyleSheet` module (extracted from `mood.tsx` in change 128). The owner
chose "safe-only" to finish the 300-line process: split this (zero behaviour risk),
leave the hook-heavy/stateful files as the already-agreed documented exceptions.

## Solution

Pure-data split, every style key/value verbatim, public import surface unchanged. The
main `styles` block (~322 lines) alone exceeded 300, so it was split across two files and
re-merged.

- `mood.styles.part1.ts` (154) — `stylesPart1` (first 30 of the 59 `styles` keys).
- `mood.styles.part2.ts` (176) — `stylesPart2` (remaining 29 keys).
- `mood.styles.customSheet.ts` (69) — `customSheetStyles` (10 keys).
- `mood.styles.sw.ts` (164) — `swStyles` (25 keys).
- `mood.styles.pickerStrip.ts` (80) — `pickerStripStyles` (11 keys).
- `styles.ts` (14) — barrel: `export const styles = { ...stylesPart1, ...stylesPart2 };` + re-exports the other three. The two importers (`app/(tabs)/mood.tsx`, `components/moodHome/CustomSlot.tsx`) are unchanged.

Local `SIDE`/`GAP` consts re-declared verbatim only in the files that reference them.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors, **0 new** (the merged `styles.X` access
type-checks). Key sets verified: part1 (30) + part2 (29) = the original 59, disjoint, no
add/drop/rename. Pure data; JS only.

## Notes

- This completes the **safe** scope of the file-size campaign: every safely-splittable
  file is now under 300. Remaining over-300 files are the agreed exceptions — pure data
  (`wallpaperCatalog.ts`) and hook-heavy/stateful logic (`mood.tsx`, `shuffle/[id]`,
  `moodNotifications`, `moodBootstrap`, `ai.tsx`, `mood/pool`, `moodHistory.persistence`,
  `mood/pick-collection`) — which can't be reduced without the behaviour-risk
  hook/state restructuring the owner declined.
- Minor leftover noted: `constants/__tests__/shuffle.test.ts` is 367 lines (a test file);
  trivially splittable later if desired.
