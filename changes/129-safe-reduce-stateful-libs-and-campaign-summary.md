# Safe-reduce stateful libs + file-size campaign summary

**Date:** 2026-05-24
**Type:** refactor

## Problem

The last two files over the cap were the most sensitive: `lib/moodNotifications.ts` (786)
and `lib/moodBootstrap.ts` (527) — stateful subsystems with shared mutable module state,
lazy native `require`s, load-order-dependent module-load side effects, and store
subscriptions. Splitting their logic risks the cold-launch notification + bootstrap
guarantees, which the "don't break logic" rule forbids.

## Solution

SAFEST possible reduction only — extracted type defs + pure constants + one pure helper;
left ALL stateful functions, the lazy `require`, every subscription, and the module-load
side effect EXACTLY in place. Both remain over the cap as documented justified exceptions.

- **moodNotifications.ts 786→713** — types → `moodNotifications.types.ts` (63); tag/id/preset constants + `FRIEND_OPENERS` + pure `clampCheckInMinutes` → `moodNotifications.constants.ts` (75); public presets re-exported. `maybeRegister()` side effect + all mutable state + all scheduling/response functions untouched.
- **moodBootstrap.ts 527→523** — only the pure `CONTEXT_MOOD_FGS_INTERVAL_MIN` constant → `moodBootstrap.constants.ts` (12). Everything else (the `booted` flag, `bootstrapMoodFeature`, both store `.subscribe` registrations, all side-effect calls) is almost entirely stateful orchestration and stays put.

## Verification

`npx tsc --noEmit` → 5 total errors, all pre-existing, **0 new**. Behaviour-preserving; JS only.

## File-size campaign — final state (changes 118–129)

**Started:** 36 files over the 300-line cap. **Result:** 28 brought under 300; 8 remain as
justified exceptions (all behaviour-preserving, verified — reducing them further would
require moving hooks / restructuring stateful modules, which risks behaviour with no test
suite, so declined per the owner's "don't break logic" directive):

| File | Final | Why it stays over cap |
|------|------:|------|
| `app/(tabs)/mood.tsx` | 2345 | ~1000 lines hooks + ~1200-line JSX coupled to local state |
| `app/shuffle/[id].tsx` | 799 | ~16 hooks + handler closures (custom-hook lift reverted as a behaviour risk) |
| `lib/moodNotifications.ts` | 713 | stateful subsystem + load-order module-load side effect |
| `lib/moodBootstrap.ts` | 523 | stateful bootstrap orchestration + store subscriptions |
| `app/(tabs)/ai.tsx` | 443 | ~148-line `onGenerate` useCallback + other hooks |
| `app/mood/pool/[id].tsx` | 381 | hook-heavy body + 8 hook-dependent callbacks |
| `lib/moodHistory.persistence.ts` | 316 | indivisible mutable `mem*` mode-state aggregate |
| `app/mood/pick-collection.tsx` | 304 | exported `ErrorBoundary` must stay + hook-dense body |

`constants/wallpaperCatalog.ts` (1990) is a pure data table — size-exempt per the rule.

Every change was committed individually, tsc-verified (no new type errors introduced at
any step), and behaviour-preserving (bodies moved verbatim; public surfaces re-exported).
