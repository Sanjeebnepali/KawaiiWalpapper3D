# Remove couple check button + fix dashboard back + mood photo-frequency switch

**Date:** 2026-05-25
**Type:** fix / feature

## Problem

Three separate requests:

1. The couple dashboard's **"Run connection check" button** was no longer wanted (the link
   works now); keep the **Connection status** card.
2. From the couple dashboard the **back button was stuck** — it called `router.back()`, but
   the dashboard is reached via `router.replace` after linking, so there was no history to
   go back to.
3. In Mood-based background, **photos changed too frequently within the same mood** ("same
   category"). The user wants a switch: ON = a new photo every check; OFF (default) = one
   photo per mood, changing only when the mood actually changes.

## Solution

1. `components/coupleDashboard/CoupleDiagnostics.tsx` — dropped the button + result list +
   the running/result state; kept the live status rows (my location sent, partner received,
   distance, proximity, error). Deleted the now-unused `lib/coupleDiagnostics.ts` (no live
   importer) to avoid dead code; the accuracy FIXES from change 144 (gate, BestForNavigation,
   Kalman) stay in the live path.
2. `app/couple/dashboard.tsx` — back button now does
   `router.canGoBack() ? router.back() : router.replace('/couple')`, so it always escapes to
   the Couple tab instead of dead-ending.
3. New persisted setting `rotateWithinMood` (default **false**) threaded through
   `moodHistory.storage`/`types`/`persistence`/index → `store/mood(.types)`; the background
   tick in `lib/moodBackgroundTask.ts` now short-circuits when `!rotateWithinMood &&
   ctx.mood === lastBgMood` (keep one photo per mood) and only rotates within a bucket when
   the toggle is ON. A "Change photo every check" toggle row was added to the Mood screen's
   background section (`app/(tabs)/mood.tsx`), shown when background is enabled.

## Files changed

- `components/coupleDashboard/CoupleDiagnostics.tsx`; deleted `lib/coupleDiagnostics.ts`
- `app/couple/dashboard.tsx` (back button)
- `lib/moodHistory.storage.ts`, `lib/moodHistory.types.ts`, `lib/moodHistory.persistence.ts`,
  `lib/moodHistory.ts`
- `store/mood.types.ts`, `store/mood.ts`
- `lib/moodBackgroundTask.ts`
- `app/(tabs)/mood.tsx` (selector + handler + toggle row)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites**. No mojibake introduced in
`mood.tsx` (byte scan = 0 markers). `npx expo run:android --variant release` →
**BUILD SUCCESSFUL in 1m 36s**, installed on phone 1, launches clean (no crash).

## Notes

- Default `rotateWithinMood = false` intentionally changes the prior "rotate every tick"
  behaviour to "one photo per mood" — that was the reported problem; the lively behaviour is
  now opt-in.
- The toggle only affects the BACKGROUND tick (the camera/live engine is separate).
