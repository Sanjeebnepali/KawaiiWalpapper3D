# Couple distance — advanced accuracy pass (outlier gate + best GPS + honest verdict)

**Date:** 2026-05-24
**Type:** fix

## Problem

After Kalman smoothing (change 142) the distance was steadier but the user still saw
"inaccurate" readings. Root causes for residual error, in order of impact:

1. **GPS teleport glitches** — a fix that reports GOOD accuracy but a position hundreds of
   metres off. The Kalman trusts accuracy, so it yanks the estimate.
2. **Not using the best GPS mode** — the live loop used `High`, not `BestForNavigation`.
3. **No visibility** — there was no way to tell whether a "wrong" number was a bug or just
   the GPS hardware (e.g. indoors, where every app is ±20–50 m). We were guessing.

## Solution

1. **Outlier gate before the filter** (`lib/gpsFilter.ts` `acceptFix`): drops a fix if it
   implies an impossible speed since the last accepted fix (> 55 m/s ≈ 200 km/h = a
   teleport glitch) or is vaguer than 100 m while a recent fix exists. The first fix (or
   one after a 60 s gap) is always accepted. Uses an explicit `hasLast` flag, not a
   timestamp sentinel, so `timeMs === 0` still counts. `recordMyFix` calls it and skips
   rejected fixes entirely (keeps the last good position). Reset by `resetMyFix`.
2. **Best GPS mode** — `coupleLiveTracking` now requests `Accuracy.BestForNavigation`
   (was `High`) for the foreground live loop.
3. **Honest accuracy verdict** — `runCoupleConnectionCheck` now reads the partner's
   `accuracy_m` too and reports: `GPS accuracy: you ±X m, partner ±Y m` plus the combined
   limit `~±√(X²+Y²) m`. If that exceeds 30 m it says so outright ("that's the GPS itself
   — go outdoors"), so a poor reading is correctly attributed to environment, not a bug.

## Files changed

- `lib/gpsFilter.ts` (`acceptFix` gate + `hasLast` flag in `resetMyFix`)
- `lib/coupleMyFix.ts` (gate before smoothing)
- `lib/coupleLiveTracking.ts` (`BestForNavigation`)
- `lib/coupleDiagnostics.ts` (partner accuracy + combined-uncertainty verdict)
- `lib/__tests__/gpsFilter.test.ts` (+4 gate tests)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites** (gate: accepts first fix,
rejects teleport, accepts walking pace, rejects vague-when-recent). Build + on-device: see
commit.

## Notes

- This is the realistic ceiling for GPS proximity: filtering + outlier rejection + best
  mode remove the noise/glitches, but two consumer GPS chips still carry inherent error.
  The connection check now makes that ceiling visible instead of leaving it a mystery.
- A future step for true sub-10 m "are we together" detection would be BLE proximity /
  same-Wi-Fi, which don't depend on GPS at all — noted, not built here.
