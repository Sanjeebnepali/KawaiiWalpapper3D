# 184 — Couple distance: uncertainty-aware correction (fix "3 m apart shows 30 m")

## Problem

On the Couple dashboard the distance meter showed **30–40 m even when the two
phones were only 3–4 m apart**. The user suspected a bug in the distance
algorithm.

Root cause (verified by reading the whole distance path —
`store/couple.geo.ts`, `lib/gpsFilter.ts`, `lib/coupleMyFix.ts`,
`lib/coupleLiveTracking.ts`): the math is **correct**. The distance is the
great-circle (`haversineMeters`) distance between two **independent consumer-GPS
fixes**, and each fix carries its own absolute error (typically ±5 m open sky,
±15–40 m indoors / near buildings). When the true separation (3–4 m) is far
below that error, the two fixes' errors dominate the result — so the raw
distance **over-states** how far apart the phones are. The Kalman filter
(`lib/gpsFilter.ts`) only removes *jitter* (noise), not the per-device *bias*,
so it can't fix this — it just makes the wrong number stable.

GPS fundamentally cannot resolve a 3–4 m separation between two devices, so we
cannot make the meter *show* 3 m. What we can do is stop displaying a confident
large number when the reading is within GPS error.

## Solution

Subtract the measurement uncertainty from the displayed distance **in
quadrature** — the standard bias correction for the distance between two noisy
points. New exported helper `correctedDistanceM(d, myAccuracy, partnerAccuracy)`
in `store/couple.geo.ts`:

```
σ² = a² + b²                       // variance of the DIFFERENCE of two fixes
corrected = sqrt(max(0, d² − σ²))  // honest separation, never negative
```

- When the raw distance is within the combined GPS error → result falls toward
  **0 ("together")**, fixing the symptom.
- When the raw distance clearly exceeds the error → result ≈ the raw value, so
  genuine medium/long distances and the near/far wallpaper trigger are
  **essentially unchanged** (at 100–200 m the correction is a fraction of a
  metre).
- It is **self-calibrating**: bad GPS reports both a large distance *and* a large
  accuracy value, so more is subtracted exactly when the error is worst.

`recomputeDistance` now computes `dRaw = haversineMeters(...)` then
`d = correctedDistanceM(dRaw, ...)`, and uses the corrected `d` for both the
stored `partnerDistanceM` (the meter) and the near/far decision so the number
and the proximity state always agree.

Each side's uncertainty is floored at `MIN_FIX_UNCERTAINTY_M = 10` (a good
consumer-GPS fix) because the Kalman-smoothed accuracy we store is
over-confident when stationary; real (larger) reported accuracies are used as-is.

The distance meter is **kept** — only its value is made honest. (We discussed
hiding the number entirely; the user chose to keep the meter.)

## Files changed

- `store/couple.geo.ts` — added `MIN_FIX_UNCERTAINTY_M` + `correctedDistanceM`;
  `recomputeDistance` now corrects the distance before storing/deciding.
- `store/__tests__/couple.geo.test.ts` — was a broken stub (dead `return` in
  `baseState`, **zero tests**). Fixed the helper and added 13 real tests for
  `haversineMeters`, `correctedDistanceM`, `recomputeDistance`, `getBufferZone`.

## Verification

- `npx jest store/__tests__/couple.geo.test.ts` → **13 passed**.
- `npx tsc --noEmit` → **5 errors, all pre-existing/unrelated**; none in the
  touched files (count unchanged from baseline).

## Notes / limitations

- This is a **display** fix. Data privacy is unchanged — each phone still
  uploads its precise lat/lng to Supabase; only the shown number is corrected.
- GPS still cannot distinguish ~4 m from ~30 m; below the combined error the
  reading is honestly just "close" and the meter shows ~0. For true close-range
  precision (metres) a different sensor (BLE RSSI / Nearby Connections) would be
  required — out of scope here.
