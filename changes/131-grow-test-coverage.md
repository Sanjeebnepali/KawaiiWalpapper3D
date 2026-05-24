# Grow unit-test coverage (shuffle, moods, ai/types, ai store)

**Date:** 2026-05-24
**Type:** test

## Problem

The test suite from change 130 covered 3 pure modules (31 tests). Expand coverage over
more pure logic + the AI store, to further lock in the refactor's behaviour.

## Solution

Written in parallel by three sub-agents (each on disjoint target files), verified
centrally with one `npm test` run.

- `constants/__tests__/shuffle.test.ts` (51) — `getCollectionIntervalMinutes` (presets, custom clamp, fallback), `nextLocalMidnight` (rollover/month-year/leap boundaries), `getNextChangeAt` (day vs interval modes), `isInDnd` (normal + midnight-wrap + degenerate), `parseHHMM`, and the catalog constants/SHUFFLE_DEFAULTS.
- `constants/__tests__/moods.test.ts` (18) — `emotionToMood` (all 7 emotions + default), `getMoodOrDefault` fallbacks, `MOOD_BY_ID`, `MANUAL_/NOTIFICATION_MOOD_IDS`, the `CATALOG_TO_MOOD` inversion (primary-wins tie-break).
- `lib/ai/__tests__/types.test.ts` (7) — `aspectToSize` (all 5 ratios → exact sizes, orientation invariants, off-contract `undefined`).
- `store/__tests__/ai.test.ts` (14) — store actions via `useAIStore.getState()` with AsyncStorage mocked + fake timers: `recordGeneration` cap, `bumpDailyGen`/`todayCount` rollover + history-independence, `removeGeneration` no-op, `clearHistory` vs `dailyGen`, `reset`, and the trim/no-trim setter behaviours.

## Verification

`npm test` → **7 suites, 137 tests passed** (3.8 s). Up from 31. `tsc` unchanged.

## Notes

- Total coverage now: pure logic in `constants/`, `lib/`, `store/`, and extracted helpers,
  plus the AI store's action layer.
- Still open: component/render tests (RNTL) and the other stores (`shuffle`/`mood`/`couple`).
