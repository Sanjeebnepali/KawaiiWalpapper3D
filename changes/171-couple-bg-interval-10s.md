
# Couple distance — tighten background GPS cadence 15s → 10s

**Date:** 2026-05-26
**Type:** fix

## Problem

Follow-up to change 170. The user reported the couple distance felt slow to
re-update while the app was **closed/backgrounded**. That slowness is a cadence
issue (distinct from the smoothing lag fixed in 170): the background location
stream ran at `timeInterval: 15_000` (15 s).

## Solution

Lowered the background `timeInterval` from 15 s to **10 s** in
`startCoupleLocation` (`lib/coupleLocation.ts`) — the "balanced" option the user
chose. This gives fresher closed-app updates while staying well above the 5 s
firehose that drained the battery on an always-linked session (removed in change
107). `distanceInterval: 0` is unchanged, so a stationary phone keeps emitting.

Honest limit (documented in the code comment): when the screen is off the OS
**Doze-throttles** the stream regardless of `timeInterval`, so this speeds up the
"backgrounded but device awake" case — it does not beat deep Doze, which would
require a far more battery-heavy mechanism.

## Files changed

- `lib/coupleLocation.ts` — `timeInterval: 15_000` → `10_000`; comment updated to
  explain the new cadence, the battery trade-off, and the Doze caveat.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- No unit test covers this expo-location runtime constant; behaviour is a cadence
  tuning, verified by the type check + the unchanged surrounding logic.

## Notes

- JS-only — no native rebuild; a Metro reload picks it up.
- Modest extra battery on an always-linked session (~50% more background GPS
  wakeups when the device is awake). Revert to `15_000` to restore the prior
  battery profile if needed.
