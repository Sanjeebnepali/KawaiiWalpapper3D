# Split final screens (login, couple/preview under cap; ai/shuffle/mood reduced)

**Date:** 2026-05-24
**Type:** refactor

## Problem

The last 5 screens over the 300 cap: `(auth)/login.tsx` (304), `couple/preview.tsx`
(306), `(tabs)/ai.tsx` (637), `shuffle/[id].tsx` (1047), `(tabs)/mood.tsx` (3048). Final
Batch B, parallel agents, verified centrally. The big three are hook-heavy and can only
go fully under cap via the hook-restructuring that was forbidden after the shuffle bug —
so they were reduced as far as PURE extraction safely allows and left as exceptions.

## Solution

PURE presentational extraction only (styles + props-only sub-components + pure
helpers/constants). No hook moved (one minor exception noted), no dependency-array change.

- **(auth)/login.tsx 304→230** — styles → `components/authLogin/styles.ts`. Under cap.
- **couple/preview.tsx 306→212** — styles → `components/couplePreview/styles.ts`. Under cap.
- **(tabs)/ai.tsx 637→443** (exception) — styles + `SUGGESTIONS`/`ASPECTS` consts + `AspectChips`/`TokenHint`/`QuickStarts`/`RecentStrip` → `components/aiGenerator/`. Residual is the ~148-line `onGenerate` `useCallback` + other hooks. (One recent-strip inline handler was wrapped in a new `onOpenHistoryItem` `useCallback` to keep the `as Href` cast inside the screen — unconditional, identity-only, behaviour unchanged.)
- **shuffle/[id].tsx 1047→799** (exception) — styles + layout consts → `components/shuffleDetail/`. Residual is ~16 hooks + handler closures (the same body whose custom-hook lift was reverted earlier as a behaviour risk).
- **(tabs)/mood.tsx 3048→2345** (exception, −703) — all 4 StyleSheet blocks (628 lines) + 6 pure helpers + the `CustomSlot` presentational component → `components/moodHome/`. Residual is ~1000 lines of hooks/handlers + a ~1200-line JSX tree tightly coupled to local state via closures.

## Verification

`npx tsc --noEmit` → 5 total errors, all pre-existing (the 2 `ai.tsx` Href casts merely
relocated to lines 169/237 as the file shrank). **0 new.** Behaviour-preserving; JS only.

## Notes

- All 19 screens now addressed: 14 under the 300 cap, 5 documented exceptions
  (`mood/pool` 381, `mood/pick-collection` 304, `ai.tsx` 443, `shuffle/[id]` 799,
  `mood.tsx` 2345). The exceptions exceed the cap ONLY because the safe path stops at the
  hook-heavy body; reducing further needs hook restructuring, which carries behaviour risk
  with no test suite — declined per the "don't break logic" rule.
- Remaining campaign items: `lib/moodNotifications.ts` (786) and `lib/moodBootstrap.ts`
  (527) — stateful subsystems with load-order side effects, handled next as safe partial
  reductions / documented exceptions.
