# Custom-hook extraction: 3 screens under 300 + test split (wave 1)

**Date:** 2026-05-24
**Type:** refactor

## Problem

Owner asked to push the remaining over-300 files under the cap (except the strict
stateful/data exceptions). The hook-heavy screens need their logic moved into custom
hooks — the riskier path (an earlier sloppy attempt on shuffle/[id] was reverted for
changing dep arrays + hook order). This wave does it the SAFE way + splits an oversized
test file.

## Solution

For each screen: verified ALL hooks sit before any early return, then moved every hook +
handler + derived value VERBATIM into a custom hook (dep arrays copied character-for-
character, no reorder, no null-guards, no logic change). Screen becomes
`const {...} = useX()` + the identical early-return + JSX. `export default` kept.

- **`app/mood/pick-collection.tsx` 304 → 121** + `hooks/usePickCollection.tsx` (205). `ErrorBoundary` export left in the screen.
- **`app/mood/pool/[id].tsx` 381 → 121** + `hooks/useMoodPool.tsx` (296). 9 useCallbacks, all deps verbatim.
- **`app/(tabs)/ai.tsx` 443 → 172** + `hooks/useAiGenerator.ts` (327). Screen under cap; hook is 327 — the ~148-line `onGenerate` generation algorithm can't be carved up without touching logic, so it's a relocated justified exception.
- **`constants/__tests__/shuffle.test.ts` 367 → 244** + `shuffle.more.test.ts` (122). Pure test split, blocks moved verbatim.

## Verification

`npx tsc --noEmit` → 5 errors, all pre-existing (the 2 ai Href casts relocated into
`useAiGenerator.ts:144,212` with `onGenerate`); **0 new**. `npm test` → 8 suites, **137
tests pass**. Behaviour-preserving (verbatim moves, deps untouched).

## Notes

- Progress: 3 of 5 target screens reduced + test split done. Remaining: `shuffle/[id]`
  (799), `mood.tsx` (2345) — wave 2.
- New relocated exception: `hooks/useAiGenerator.ts` (327) — the generation algorithm.
- Strict exceptions still standing (not touched): `moodNotifications`, `moodBootstrap`,
  `moodHistory.persistence`, `wallpaperCatalog` (data).
- No on-device test net for screens — full build + logcat smoke test after wave 2.
