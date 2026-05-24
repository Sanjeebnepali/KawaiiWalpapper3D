# Couple proximity — Kalman-smooth the GPS so the distance stops jittering

**Date:** 2026-05-24
**Type:** fix

## Problem

With live tracking working (change 141), the distance was now fast but **inaccurate**:
standing at one spot it read 30 m, then 20, then 18 — bouncing up and down with nobody
moving. Cause: consumer-phone GPS drifts several metres between fixes even when stationary,
and the couple distance is derived from TWO such noisy positions, so the errors stack.
Update rate is irrelevant — the noise is in each measurement, not the cadence.

## Solution

Run every fix for the LOCAL user through a **1-D Kalman filter** (the standard GPS-track
smoother) before it's stored / pushed. It converges to a stable estimate while the phone
is still and still tracks genuine movement, because each measurement is weighted by its
reported accuracy (a vague fix barely moves the estimate; a sharp one moves it more).

- `lib/gpsFilter.ts` (new) — `GpsKalmanFilter` class (variance grows by Q²·Δt between
  fixes, corrected by gain `k = var/(var+accuracy²)`; lat/lng share one scalar variance).
  A module singleton `myFilter` (Q = 2 m/s) + `smoothMyFix()` / `resetMyFix()`.
- `lib/coupleMyFix.ts` (new) — `recordMyFix(code, lat, lng, accuracy)`: the single funnel
  that smooths → `setMyLocation` → `pushMyLocation`. Centralised so none of the three GPS
  entry points can bypass the filter (which would reintroduce jitter on that path).
- `lib/coupleLiveTracking.ts`, `lib/coupleLocation.ts` (live loop, background task, startup
  seed) — all now call `recordMyFix` instead of raw `setMyLocation` + `pushMyLocation`.
  `stopCoupleLocation` calls `resetMyFix()` so a new pairing starts from a clean fix.

Each phone smooths its OWN GPS at the source, so the position the partner receives is
already clean → the computed distance is between two smoothed points → stable.

## Files changed

- `lib/gpsFilter.ts` (new) + `lib/__tests__/gpsFilter.test.ts` (new, 3 tests)
- `lib/coupleMyFix.ts` (new)
- `lib/coupleLiveTracking.ts`, `lib/coupleLocation.ts` (route through `recordMyFix`)

## Verification

`npx jest lib/__tests__/gpsFilter.test.ts` → **3 passed** (jitter reduced vs raw, tracks
sustained movement, reset clears state). `tsc --noEmit` → **0 errors**. Build + on-device:
see commit (release APK, launches clean).

## Notes

- This removes the noise-driven BOUNCING; it does not make GPS perfectly precise. Two
  devices still carry inherent error (worse indoors / beside tall buildings), so the
  absolute distance can still be off by some metres — but it will be STABLE and follow the
  real trend instead of flickering 30→20→18 at one spot.
- Q = 2 m/s balances "stable when still" vs "responsive when walking". Easy to retune in
  one constant if it feels too smooth (laggy) or not smooth enough.
- Both phones need this build for the smoothing to apply to both sides of the distance.
