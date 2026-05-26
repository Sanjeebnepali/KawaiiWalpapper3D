
# Couple distance — adaptive Kalman Q to cut walking lag

**Date:** 2026-05-26
**Type:** fix

## Problem

The user reported the couple distance "takes too much time to re-update" while
walking, even with the foreground loop at 1.5 s — and the same slowness when the
app is closed. The dominant cause is the GPS smoothing filter, not the cadence:
`lib/gpsFilter.ts` used a single fixed process-noise `Q = 2 m/s`. At a typical
~10 m accuracy and a 1.5 s tick that yields a steady-state Kalman gain of only
~0.22, so each new fix nudged the estimate barely a fifth of the way toward
reality — the displayed position creeps behind a walk over several ticks even
though a fresh fix arrives every 1.5 s.

`Q = 2` was chosen (change 142) to kill the stationary jitter; raising it
globally would re-introduce that jitter. The real fix is to make `Q` adaptive.

## Solution

**Adaptive `Q` from GPS-reported ground speed** (`qForSpeed` in
`lib/gpsFilter.ts`). GPS speed is Doppler-derived and far more reliable than
differencing two noisy positions over the ~2 m a walk covers in 1.5 s, so it's a
clean movement signal:

- still (≈0 m/s) → `Q_MIN = 0.6` → heavier smoothing than before → steadier number.
- walking (~1.4 m/s) → `Q ≈ 4.8` → steady-state gain ~0.44 → tracks within ~2 fixes.
- running (≥~2.5 m/s) → `Q_MAX = 8` → minimal lag.

`Q = clamp(Q_MIN + speed * 3, Q_MIN, Q_MAX)`. High `Q` is only ever picked WHEN
the phone is actually moving, so the stationary-stability property is preserved
(improved — `Q_MIN < 2`). When speed is unavailable (null, or −1 on iOS for an
invalid fix) it falls back to the constructor's default `Q`, so behaviour is
never worse than the old fixed-`Q` filter.

`speedMps` is threaded through the existing single funnel: `GpsKalmanFilter.process`
→ `smoothMyFix` → `recordMyFix`, and all three GPS entry points pass
`coords.speed` (foreground live loop, background location task, the startup seed).
No call site behaviour changes beyond supplying the speed; this also benefits the
background path (each 15 s fix snaps to position instead of creeping).

## Files changed

- `lib/gpsFilter.ts` — `qForSpeed` + `Q_MIN`/`Q_MAX`/`Q_SLOPE`; `process` and
  `smoothMyFix` gain an optional `speedMps`; constructor param renamed
  `qMetresPerSecond` → `qDefault` (now the fallback).
- `lib/coupleMyFix.ts` — `recordMyFix` gains optional `speedMps`, passed to `smoothMyFix`.
- `lib/coupleLiveTracking.ts` — foreground tick passes `pos.coords.speed`.
- `lib/coupleLocation.ts` — background task + startup seed pass `coords.speed`.
- `lib/__tests__/gpsFilter.test.ts` — +2 tests (speed hint tracks faster; zero-speed
  smooths at least as hard as the default).

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx jest` → **164 passed / 11 suites** (was 162; +2 adaptive tests).

## Notes

- JS-only — no native rebuild; a Metro reload picks it up.
- This addresses the *smoothing* lag (the dominant "slow while walking" cause)
  and improves quality on the background path too. It does NOT change the
  background update *cadence* (`timeInterval: 15_000` in `startCoupleLocation`),
  which is the separate "feels slow when the app is closed" factor — that's a
  battery trade-off left for a follow-up decision.
- The constants are a tuned starting point. If walking still feels laggy, raise
  `Q_SLOPE`/`Q_MAX`; if a still phone jitters, lower `Q_MIN`.
