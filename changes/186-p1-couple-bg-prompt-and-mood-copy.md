# P1 follow-ups: couple battery prompt + honest mood copy

**Date:** 2026-05-30
**Type:** fix

## Problem

Two P1 items the change-185 pre-publish audit flagged but didn't fix:

1. **Couple users are never nudged to whitelist battery / autostart.**
   `maybePromptBackgroundAccess()` was only called from the mood/shuffle/friend
   bootstrap. A user who only uses the Couple feature (never enables a mood
   feature) was never prompted, so on Vivo / MIUI / ColorOS the couple location
   foreground service is silently frozen when the app is closed — distance just
   stops updating with no explanation.
2. **Mood UI copy falsely claimed "step count" / "motion guess" on Android.**
   `app/(tabs)/mood.tsx` said "Time + motion guess" and "time of day + step
   count," but on Android the pedometer API is iOS-only and `stepCount.ts`
   hard-returns `null` — the engine is purely time-driven. This misleading copy
   was the likely source of the "is it step-driven?" confusion.

(The audit's third item — the stale `maybePromptBackgroundAccess` doc comment —
was left for a separate commit: that file has unrelated in-flight changes, so
editing it here would have entangled two logical units.)

## Solution

1. **Couple flow now nudges for background access.** `enterLinkedMode`
   (`lib/coupleBootstrap.ts`) calls `maybePromptBackgroundAccess()` right after
   `startCoupleLocation()` succeeds (perm not denied). This runs both on link
   and on cold-boot when already linked — the couple equivalent of the mood
   bootstrap hook. The helper is self-limiting (no-ops when already whitelisted,
   already shown this session, or previously dismissed), so couple users now get
   the same one-time nudge mood users already got.
2. **Honest mood copy.** Dropped the "step count" / "motion guess" claims:
   - "Time + motion guess + daily prompt — no camera needed" → "Time of day +
     daily prompt — no camera needed"
   - "Runs every ~30 min · time of day + step count" → "Runs every ~30 min ·
     changes with the time of day"
   - Updated the internal tier-3 doc comment to note steps are iOS-only/unused
     on Android.

Couple reboot-resume was considered but intentionally NOT implemented: couple
proximity needs the partner's live location over Supabase realtime, which
requires the JS runtime + network — a native boot receiver can't compute it the
way the mood/sleep-wake native services apply a local bitmap. It already
re-bootstraps on the next app open; that's the honest ceiling for this feature.

## Files changed

- `lib/coupleBootstrap.ts` — import + `maybePromptBackgroundAccess()` call after `startCoupleLocation()`.
- `app/(tabs)/mood.tsx` — three copy/comment fixes dropping the false Android "step count" claim.

## Verification

- `npx tsc --noEmit` → exit 0 (no errors; none added).
- `npm test` → 13 suites, 203 tests pass.
- Release rebuild on device `10BD3J019Y00073` — `BUILD SUCCESSFUL`, APK installed
  (JS-only change, embedded in the release bundle).

## Notes

- The couple nudge respects the same persisted `bgAccessPrompted` gate, so a user
  who already saw it via mood won't be double-prompted — the gap closed is the
  couple-ONLY user who never saw it at all.
- Remaining honest limit (documented, not a regression): couple tracking resumes
  on next app open after a reboot, not autonomously, for the reason above.
