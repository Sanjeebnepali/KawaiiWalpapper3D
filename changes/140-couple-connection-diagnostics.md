# Couple proximity — release-visible connection diagnostics

**Date:** 2026-05-24
**Type:** diagnostic / investigation tool

## Problem

User report: with **two linked phones**, the couple distance shows the default
(`— m` / `no data yet` / proximity `—`) and never updates — "so hard to get an accurate
result."

Investigation of the app-side chain found it **correct and robust**:
- Algorithm: `haversineMeters` (great-circle straight-line distance) — the right choice
  for "are these two physically together?" (road-routing à la Uber would be wrong + needs
  a paid API/server).
- Data flow: live GPS stream → `setMyLocation`/`pushMyLocation`; partner GPS via the
  realtime channel (`couple.realtime.ts`) AND a 25 s poll backstop (`enterLinkedMode`);
  both run through `recomputeDistance`. An immediate `getCurrentPositionAsync` seed avoids
  the "stationary phone never emits" gap.
- Device permissions: `ACCESS_FINE/COARSE/BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION`
  all `granted=true` (verified via `dumpsys`).

So the break is in the **phone↔phone exchange via Supabase** (e.g. Realtime not enabled
for `couple_locations`, or an RLS policy that hides the partner's row). The blocker to
diagnosing it: **a release build silences every failure** in that path — they are all
`if (__DEV__) console.warn(...)`, stripped from the production bundle. No signal reaches
the user or the logs.

## Solution

Make the failure **visible in release**, on demand, with the raw server error:

- `lib/coupleDiagnostics.ts` — `runCoupleConnectionCheck()` runs the real end-to-end
  round-trip ONCE and returns plain ✓/✗ lines: signed in → linked + partner id →
  read my GPS → **write to `couple_locations`** (surfaces an RLS write-block) →
  **read the partner's row** (surfaces an RLS read-block / "partner offline") →
  resulting straight-line distance. It calls Supabase directly so it captures the raw
  `error.message` the normal path swallows.
- `components/coupleDashboard/CoupleDiagnostics.tsx` — a "Connection status" card showing
  live store state (my-location age, partner-location age, distance, proximity, store
  error) + a "Run connection check" button that renders the result lines.
- `app/couple/dashboard.tsx` — renders `<CoupleDiagnostics />` under the partner card.

No behaviour change to the proximity engine itself — this only adds observability.

## Files changed

- `lib/coupleDiagnostics.ts` (new)
- `components/coupleDashboard/CoupleDiagnostics.tsx` (new)
- `app/couple/dashboard.tsx` (import + render)

## Verification

`tsc --noEmit` → **0 errors**. `npx expo run:android --variant release --no-bundler` →
**BUILD SUCCESSFUL in 43s**, APK installed, app launches (PID alive), no crash in logcat
(new component renders fine).

## Notes

- Next step is on-device: the user runs the check on BOTH phones and reads back the lines.
  That pinpoints whether the write is blocked, the partner-read is blocked/empty, or the
  partner simply hasn't sent — which determines the (server-side) fix.
- The card is intentionally release-visible and kept as a genuine "sharing status" surface
  rather than a dev-only panel, since the feature failing silently was the core problem.
