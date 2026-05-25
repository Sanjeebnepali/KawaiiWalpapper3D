# Black-box QA pass + Restore-toast fix

**Date:** 2026-05-25
**Type:** chore

## Problem

Requested a black-box QA pass on the release build with parallel debugging, a
written report, and fixes for anything found.

## Solution

Ran a structured QA pass (the device is PIN-locked, so UI driving wasn't
possible — used device runtime checks + regression + a behavioural/code audit):

- **Device runtime:** app launches with no crash and no JS error from our
  process (other logcat errors are system/Google processes, not ours);
  `ShuffleForegroundService` is running (`isForeground=true`); the packaged APK
  manifest contains `SCHEDULE_EXACT_ALARM` + `SleepWakeForegroundService` +
  `SleepWakeAlarmReceiver`, confirming the sleep/wake exact-alarm fix landed.
- **Regression:** `tsc` 0 errors; `jest` 157/157 (10 suites).
- **Behavioural audit (15 cases):** subscription gating + page, couple
  inherit/relock chain, couple restore, mood-notification tap, sleep/wake exact
  timing, shuffle first-change, free tier, settings, navigation — all PASS.

**Defect found & fixed (BB-1, minor):** the subscription page's "Restore
purchases" always toasted *"No previous purchases to restore"* even when the
user was subscribed. It now reflects the local entitlement state.

Full results in `BLACK_BOX_TEST_REPORT.md`.

## Files changed

- `BLACK_BOX_TEST_REPORT.md` — **new**, full QA report + residual risks.
- `app/subscription.tsx` — Restore toast reflects active entitlement.

## Verification

- `tsc` 0 errors; `jest` 157/157.
- Device: no crash, FGS running, exact-alarm components present in the APK.

## Notes

Residual risks (operational, not code defects — see the report): enforcement is
LIVE and the dev-unlock was removed, so premium is tested via the free mock
"Subscribe"; purchases are a local mock until RevenueCat is wired; Vivo
background reliability needs the three Background Access toggles; the couple
chain is prevented client-side only until server-side enforcement (real
billing); sleep/wake has benign redundant appliers.
