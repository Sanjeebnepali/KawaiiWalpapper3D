# Android footsteps made honest + mood-automation fixes

**Date:** 2026-05-23
**Type:** fix

## Problem
QA confirmed the long-standing "footstep walk doesn't work properly" complaint: `lib/stepCount.ts` read steps via `Pedometer.getStepCountAsync(start, end)`, which on **Android unconditionally throws** `NotSupportedException` (it's an iOS-only date-range API — confirmed in `node_modules/expo-sensors` Android `PedometerModule`). So on the owner's Vivo/Xiaomi, step reads always failed, walking never influenced the wallpaper, yet `getStepStatus()` returned `'available'` and the toggle toast claimed **"✓ steps tracking"** — and the app requested a scary motion permission for a feature that could never work. Plus three smaller mood-automation bugs (M5, M7, and a mood-label race).

Per the owner's decision: make Android **honest** (don't claim steps work), keep mood driven by time-of-day. A real Android step source is a separate, larger effort (live `TYPE_STEP_COUNTER` / Health Connect).

## Solution
- **C3/H2 — `lib/stepCount.ts`:** on Android, `getStepStatus()` returns `'unsupported'` and `recentSteps()` returns `null` *without* calling the throwing API; `ensureMotionPermission()` is a no-op on Android (no prompt). iOS paths are untouched. Comments cite the iOS-only limitation.
- **`lib/contextMood.ts`:** the `recentSteps != null` guard already fell through to the time-of-day bands correctly; added a comment documenting that steps are always `null` on Android so nothing assumes a count.
- **H2 — `app/(tabs)/mood.tsx` `onToggleBackground`:** the existing `'unsupported'` toast branch now reads "changes by time of day" instead of implying steps work; corrected the stale comment that claimed the user just needed to grant permission.
- **M5 — `onRunBgNow`:** now checks `backgroundEnabled` ("Turn background on first") and `moodCollectionId` ("Pick a pool first") before running, and the genuine no-op case says "No change yet — try again shortly" instead of falsely asserting "same mood".
- **M7 — sleep/wake:** `runSleepWakeFallback` (`lib/moodBackgroundTask.ts`) early-returns after the sleep branch applies (one pass can never apply both wake and sleep) and bails when `sleepHour === wakeHour` (degenerate window). The hour pickers in `mood.tsx` toast-and-ignore a selection equal to the other hour.
- **Mood-label race — `onSelectMood`:** `selectMoodManual(id)` is now `await`ed and only runs **after** a successful apply, so on an apply failure the header no longer flips to a mood the wallpaper didn't actually change to. The no-collection early-return still records the manual selection before navigating to the preview grid.

`runMoodBackgroundOnce` keeps its boolean return — three out-of-scope callers (`lib/moodBootstrap.ts`, `hooks/useShuffleEngine.ts`, the task handler) depend on it — so M5 was solved with an in-component state check rather than a signature change.

## Files changed
- `lib/stepCount.ts` — Android short-circuits for `getStepStatus`/`recentSteps`/`ensureMotionPermission`; added `import { Platform }`.
- `lib/contextMood.ts` — documentation only (logic already correct).
- `lib/moodBackgroundTask.ts` — `runSleepWakeFallback` equal-hours guard + early return after sleep applies.
- `app/(tabs)/mood.tsx` — honest Android toast, `onRunBgNow` true-reason reporting, hour-picker equal-hour guards, `onSelectMood` apply-then-label ordering.

## Verification
- `npx tsc --noEmit` — clean for these files.
- On an Android device: enable "Auto-change in background" — toast no longer says "steps tracking" and no motion-permission dialog appears; mood still rotates by time of day. Set wake and sleep to the same hour — picker refuses it.

## Notes
- The wake/sleep presets (6–9 AM vs 9 PM–12 AM) can't currently produce equal values, so the picker guard is belt-and-braces today; the runtime guard in `runSleepWakeFallback` still protects any already-persisted equal-hour state.
- Real Android step counting (so walking *does* drive the wallpaper) remains a follow-up: subscribe to the live step-counter sensor and diff cumulative counts, or integrate Health Connect.
