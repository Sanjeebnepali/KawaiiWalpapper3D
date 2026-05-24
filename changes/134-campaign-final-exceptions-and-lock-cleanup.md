# Campaign final: shuffle/[id] + mood.tsx confirmed exceptions; lock cleanup

**Date:** 2026-05-24
**Type:** chore + docs

## Problem

Wave 2 of the custom-hook reduction targeted the last two over-300 screens —
`app/shuffle/[id].tsx` (799) and `app/(tabs)/mood.tsx` (2345). Both turned out to be
unsafe/unproductive to reduce.

## Outcome

- **`shuffle/[id].tsx` — left unchanged (exception).** The hook-safety check failed: 7
  hooks (`useMemo` + 6 `useCallback`) are called AFTER the `if (!collection) return`
  early return. A verbatim hook-extraction is impossible without reordering hooks /
  moving the early return — the exact behaviour change that was reverted before. Stays
  at 799 as a documented exception.
- **`mood.tsx` — extraction attempted, then REVERTED.** Moving its ~989 lines of logic
  into `useMoodHome.ts` (466) + `moodHome.handlers.ts` (834) left the screen at 1356
  (its ~1218-line JSX can't be decomposed without many risky prop-threaded sub-components)
  and turned ONE over-300 file into THREE — a net regression, on the most complex screen,
  with no component-test net and fragile double-encoded mojibake in its strings. A single
  documented exception is cleaner + safer than three risky fragments, so the extraction
  was reverted (screen back to 2345, the two orphan files deleted).

Also: untracked `.claude/scheduled_tasks.lock` (a runtime session lock accidentally
committed in change 133) and added it to `.gitignore`.

## Files changed

- `.gitignore` — ignore `.claude/scheduled_tasks.lock`.
- `.claude/scheduled_tasks.lock` — removed from tracking.

## Verification

`npx tsc --noEmit` → 5 pre-existing errors, 0 new. `mood.tsx` + `shuffle/[id]` are
byte-identical to before wave 2.

## Final file-size campaign state (changes 117–134)

Every logic file that can be reduced WITHOUT behaviour risk is now under 300. The 7
files still over 300 are all justified exceptions:

| File | Lines | Why it stays |
|------|------:|------|
| `app/(tabs)/mood.tsx` | 2345 | ~1218-line JSX + ~989 lines cohesive logic; safe extraction only fragments it into more >300 files at high risk |
| `constants/wallpaperCatalog.ts` | 1990 | pure data table (rule-exempt) |
| `app/shuffle/[id].tsx` | 799 | hooks after early return — cannot extract without reordering |
| `lib/moodNotifications.ts` | 713 | stateful subsystem + load-order module-load side effect |
| `lib/moodBootstrap.ts` | 523 | stateful bootstrap orchestration + subscriptions |
| `hooks/useAiGenerator.ts` | 327 | the ~148-line `onGenerate` generation algorithm |
| `lib/moodHistory.persistence.ts` | 316 | indivisible mutable mode-state aggregate |

Everything was committed individually, tsc-verified (0 new errors throughout), and the
prior on-device build + logcat run confirmed the app runs clean.
