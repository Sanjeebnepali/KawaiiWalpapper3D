# Couple — switch your side after linking + faster live refresh (1.5 s)

**Date:** 2026-05-24
**Type:** fix / feature

## Problem

Two requests:

1. **Live distance should refresh in ~1–2 s while the app is open** (it was 3 s), and stay
   on the slow battery cadence when closed. The open/closed split already existed
   (foreground live loop via `useFocusEffect` vs the 15 s background stream); only the
   foreground interval needed tightening.
2. **"Selecting Boy from one phone doesn't change after linking."** On the preview screen,
   when already linked, tapping Boy/Girl only updated a local highlight + the "On your
   phone now" text — the CTA just navigated, so the choice was never saved. There was no
   post-link way to change your side at all.

## Solution

1. `lib/coupleLiveTracking.ts` — `LIVE_INTERVAL_MS` 3000 → **1500**. (GPS hardware caps
   at ~1 Hz and the reentrancy guard skips overlapping ticks, so it refreshes as fast as
   fixes arrive without stacking.)

2. Make the side selection persist after linking:
   - `lib/couple.ts` — new `setMyCoupleRole(role)`. Roles must stay opposite
     (`couples_roles_differ_check` + the "two halves complete the picture" design), so
     picking my side also flips the partner — written as ONE `couples` update
     (`creator_role`/`partner_role`) so the post-update row never violates the constraint.
     Uses the existing **"couples: update own"** RLS policy (a member may update their
     couple row) — no new RPC/migration. Updates the local store immediately; the partner
     receives the swap over the `couples` realtime channel (status stays `linked` →
     re-fetch → `setLink`).
   - `lib/coupleBootstrap.ts` — the proximity subscriber now also re-applies the wallpaper
     when `link.myRole` changes, so both phones swap to the correct solo half (covers the
     local switch AND the realtime-delivered swap).
   - `app/couple/preview.tsx` — tapping a side calls `onPickSide`: before linking it's the
     local pick carried to setup (unchanged); after linking it persists via
     `setMyCoupleRole` + toasts the new side. The wallpaper re-apply is handled by the
     subscriber above.

## Files changed

- `lib/coupleLiveTracking.ts` (interval)
- `lib/couple.ts` (`setMyCoupleRole`)
- `lib/coupleBootstrap.ts` (re-apply on role change)
- `app/couple/preview.tsx` (persist side selection when linked)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **140 passed / 9 suites**. Build + on-device:
see commit (release APK, launches clean on both phones).

## Notes

- Switching your side swaps BOTH roles (you ↔ partner) by design — there are only two
  halves and they must differ. The partner's phone updates within a moment via realtime.
- 1.5 s is foreground-only (dashboard focused). Closed/blurred still uses the 15 s
  battery-saving cadence — unchanged.
