# Dynamic proximity buffer zone (hysteresis) — anti-flicker

**Date:** 2026-05-21
**Type:** feature

## Problem

The couple-proximity wallpaper flipped on a **single 100 m line** (`distance
< thresholdM` → near, else far). When partners hover *around* that line,
normal GPS jitter pushes the distance back and forth across it every few
seconds, so the wallpaper **flickers** between the couple and solo images.

Owner forwarded a larger spec; after review the one genuinely high-value
idea was a **buffer zone with hysteresis**, sized dynamically by GPS
accuracy so it works city → suburb → mountain. The rest of the spec was
either already built (Haversine, geofencing, 30 s updates, Supabase realtime,
LOVE-XXXX codes, the screens) or declined as scope-drift (a full AWS
provider-swap abstraction + `src/services` rewrite, a DB schema rename, and
swapping `expo-location`/the custom wallpaper module for paid/bare-RN libs).
This change implements only the buffer zone.

## Solution

**Two thresholds + a hold band (`store/couple.ts`).** New exported
`getBufferZone(accuracy)` returns `{ near, far }` metres:

| GPS accuracy | near | far |
|---|---|---|
| < 10 m (good fix) | 80 | 120 |
| < 30 m (typical urban) | 100 | 150 |
| ≥ 30 m (dense city / indoors / rural) | 150 | 200 |
| unknown | 150 | 200 (widest = least flicker) |

`recomputeDistance` now applies **hysteresis**:
- `distance < near` → `near` (couple wallpaper)
- `distance > far` → `far` (solo wallpaper)
- `near ≤ distance ≤ far` → **hold the current state** (no change → no flicker)
- first reading inside the band (prior state `unknown`) → default `far`
  (don't show the couple wallpaper until partners are clearly close)
- `paused` → forced `far` (unchanged)

The band is sized off the **worse of the two phones' accuracies** (be
conservative when either side's fix is uncertain).

**Threading GPS accuracy through.** The store gained `myAccuracy` /
`partnerAccuracy`; `setMyLocation` / `setPartnerLocation` take an optional
accuracy (backward-compatible — old call sites still compile). Wired up:
- `lib/coupleLocation.ts` — the location task now passes `coords.accuracy`
  into `setMyLocation`. The geofence radius is now the **far edge** of the
  band (was the old fixed `thresholdM`) so the OS wakes us at the same
  boundary the wallpaper logic flips on.
- `lib/couple.ts` — the realtime `couple_locations` handler passes
  `accuracy_m` into `setPartnerLocation`; `fetchPartnerLocation` selects and
  returns `accuracy_m`.
- `lib/coupleBootstrap.ts` — initial partner-GPS hydrate passes the accuracy.

`thresholdM` (mirrored from `couple_settings.proximity_threshold_m`) is left
in the store for backward-compat / realtime sync but no longer drives the
decision — the dynamic band does.

## Files changed
- `store/couple.ts` — `getBufferZone()`; `myAccuracy`/`partnerAccuracy`
  state; accuracy params on `setMyLocation`/`setPartnerLocation`;
  `recomputeDistance` rewritten with dynamic hysteresis.
- `lib/coupleLocation.ts` — pass accuracy into the store; geofence radius =
  far band (`getBufferZone`).
- `lib/couple.ts` — realtime handler + `fetchPartnerLocation` carry
  `accuracy_m`.
- `lib/coupleBootstrap.ts` — initial hydrate passes partner accuracy.

## Verification
- `npx tsc --noEmit`: 0 new errors (9 total, all pre-existing in untouched
  files; the only couple match is the long-standing `fetchActiveCouple`
  embedded-select cast at `lib/couple.ts:192`, untouched).
- Logic check: walking the boundary with a ~15 m fix, distance bouncing
  90↔110 m now stays in the 100–150 band → wallpaper holds (no flip).
  Crossing < 100 m → couple; going > 150 m → solo. A poor 40 m fix widens
  the band to 150–200 m so noisy rural GPS doesn't thrash.

## Notes
- Decided AGAINST (recorded for context): the AWS `src/services` provider
  abstraction (premature — `lib/couple.ts` is already the single DB
  chokepoint), the DB schema rename (current schema is RLS-secured +
  role-aware + working), and the library swaps (`react-native-background-
  geolocation` is paid; the app deliberately uses free `expo-location` +
  a custom Kotlin wallpaper module + `expo-notifications`).
- The Kalman GPS smoothing from the spec was judged marginal once the
  hysteresis band + the existing 25 m distance filter are in place; skipped
  to keep the change minimal per the owner's chosen scope.
- `couple_settings.accuracy_m` already exists (written by `pushMyLocation`),
  so no schema change was needed to read partner accuracy.
- JS-only; picks up on a Metro `--clear` reload (the proximity engine itself
  still needs the native build + background-location permission to run).
