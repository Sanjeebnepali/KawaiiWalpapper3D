# Couple proximity — fold into the mutual-exclusivity rule (yields like a driver)

**Date:** 2026-05-24
**Type:** fix

## Problem

Theme shuffle / Mood-based / Friend check-in are mutually exclusive continuous drivers
(turning one on stops the others); Sleep/Wake is a layer that coexists. Couple proximity
was deliberately left OUT of that rule, so it ran on top of an active driver and the two
fought over the wallpaper. The user asked for Couple to be mutually exclusive like the
others — but still coexist with Sleep/Wake.

## Solution

Fold Couple in **asymmetrically**, to avoid the cross-partner Supabase pause write and the
multi-bootstrap ordering fragility a symmetric "pause couple" approach would cause:

- `lib/automationMode.ts` — `DriverId` gains `'couple'` + a label + an `isDriverActive`
  case (`linked && !paused`). Couple is intentionally **kept out of the `DRIVERS` array**
  (the set the boot normalization + `getActiveDrivers` iterate), so the boot pass never
  issues a cross-partner pause.
- `lib/coupleWallpaper.ts` — `applyProximityWallpaper` now **yields**: if any of
  theme/mood/friend is active (`getActiveDrivers().length > 0`) it applies nothing and
  resets its dedup, so Couple never fights them, and re-applies on the next tick once the
  other driver is turned off.
- Explicit Couple activation **claims** the slot via `enforceSingleDriver('couple')`
  (which stops theme/mood/friend — it already handles any `keep`):
  - `app/couple/dashboard.tsx` — resuming sharing (un-pause) calls it + toasts what it
    paused.
  - `app/couple/setup.tsx` — accepting a code (linking) calls it.

Net: turning on theme/mood/friend → Couple silently yields; resuming/linking Couple →
the others stop. Sleep/Wake is untouched (never in `DRIVERS`, never checked by the yield).

## Files changed

- `lib/automationMode.ts` (DriverId + label + isDriverActive 'couple'; DRIVERS unchanged)
- `lib/coupleWallpaper.ts` (yield guard in `applyProximityWallpaper`)
- `app/couple/dashboard.tsx` (resume → `enforceSingleDriver('couple')`)
- `app/couple/setup.tsx` (accept → `enforceSingleDriver('couple')`)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites** (no regression in the
existing automation-mode coverage). Build + on-device: see commit.

## Notes

- Asymmetric by design: being linked in the background does NOT kill an active theme
  shuffle (it would be surprising to lose your shuffle just by having a partner linked);
  Couple only claims the wallpaper when you explicitly resume/link it, and yields whenever
  another driver is on.
- No new RPC/migration — `enforceSingleDriver('couple')` reuses the existing flag-flip
  teardown; the yield is pure client logic.
