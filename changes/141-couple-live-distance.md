# Couple proximity — Uber-style live distance while the dashboard is open

**Date:** 2026-05-24
**Type:** feature / UX

## Problem

After the connection diagnostics (change 140) confirmed the data link works on two
linked phones, the remaining complaint was **latency**: the distance updated only every
~15–25 s, so it felt frozen — "took a lot of time to change." The user wants it to feel
live, like watching the Uber driver close in.

The slow cadence is by design for battery: the background location stream runs at
`timeInterval: 15_000` and the partner-poll backstop at 25 s (`lib/coupleLocation.ts` /
`lib/coupleBootstrap.ts`). That's right when the app is closed, but wrong when the user is
actively staring at the dashboard.

## Solution

Add a **foreground "live distance" mode** that only runs while the Couple dashboard is
focused — mirroring how a ride-hailing app tracks fast only during an active trip.

- `lib/coupleLiveTracking.ts` (new) — `startCoupleLiveTracking()` / `stopCoupleLiveTracking()`
  drive a module-singleton timer at `LIVE_INTERVAL_MS = 3000`. Each tick, in parallel:
  1. takes a FRESH `Location.Accuracy.High` fix of our position → `setMyLocation` (instant
     local recompute) → `pushMyLocation` (so the partner sees us move quickly); and
  2. pulls the partner's latest row via `fetchPartnerLocation` → `setPartnerLocation`.
  Both feed `recomputeDistance`. A reentrancy guard (`ticking`) prevents a slow GPS fix
  from stacking overlapping ticks; the singleton timer prevents double-loops on
  blur→focus.
- `app/couple/dashboard.tsx` — a `useFocusEffect` starts live tracking on focus and stops
  it on blur/unmount, so the fast (battery-heavier) loop is bounded to "screen on, looking
  at this screen." Placed before the existing early return so hook order stays stable; the
  tracker no-ops when not linked or paused.

Net effect: while watching, the distance tracks reality within a few seconds; when the
screen is closed, the slow background cadence resumes untouched.

## Files changed

- `lib/coupleLiveTracking.ts` (new)
- `app/couple/dashboard.tsx` (import `useFocusEffect` + the tracker; focus effect)

## Verification

`tsc --noEmit` → **0 errors**. `useFocusEffect` confirmed exported by expo-router. Build +
on-device verification: see commit (release APK, launches clean).

## Notes

- Mutual liveness has a physical limit: I see the partner move only as fast as THEIR phone
  pushes. If their dashboard is also open, their live loop pushes every 3 s (+ realtime
  delivers it near-instantly), so both see each other live. If their phone is pocketed
  (background stream), their position is up to ~15 s old no matter how fast I poll — same
  as Uber needing the driver's app active. Documented for the user.
- Battery: High-accuracy GPS every 3 s is heavy, but only while the dashboard is
  foreground with the screen on — the right time to pay for it.
