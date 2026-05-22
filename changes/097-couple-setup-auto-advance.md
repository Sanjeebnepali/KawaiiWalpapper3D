# 097 — Couple setup screen auto-advances to dashboard on link

**Date:** 2026-05-22
**Type:** fix

## Problem

After #095/#096 the link succeeds, but the **creator** can still be left on the
**Setup** screen (the generate / paste-code page) after generating a code: the
partner reaches the dashboard, the creator does not. They only auto-advance if
they first tapped "Continue → Waiting room" (`linking.tsx`, which has the
listener). Staying on Setup to copy/share the code → stranded.

## Root cause

The auto-advance + safety poll added in #095 lived only in `linking.tsx` (the
waiting room). `app/couple/setup.tsx` had no listener on the couple link
status, so when the partner accepted and the store flipped to `linked`, the
Setup screen never navigated.

## Solution

Mirror the waiting-room behavior in `setup.tsx`:

- `useEffect` on `link?.status`: when it becomes `linked`,
  `router.replace('/couple/dashboard')`. Covers "generated a code and stayed on
  Setup while the partner accepted."
- Safety-net poll (3 s) while `pending`: `fetchActiveCouple()` → push a `linked`
  row into the store (which fires the effect above) so the creator advances
  even if the realtime event is delayed.

Both are idempotent with the partner's own `router.replace` in `onAccept` (same
destination) and harmless if the screen is opened while already linked
(redirects to the dashboard, which is correct).

## Files changed
- `app/couple/setup.tsx` — import `useEffect`, `useCoupleLink`,
  `useCoupleStore`, `fetchActiveCouple`; added the linked→dashboard effect and
  the pending poll.

## Verification

1. Rebuild + install on both phones.
2. Phone A: Couple → Generate code → **stay on the Setup screen** (don't tap
   Continue).
3. Phone B: Couple → enter code → Link.
4. **Phone A jumps to the dashboard on its own** within ~1–3 s. Also still works
   from the waiting room (linking.tsx) path.

## Notes

- JS-only → release rebuild on both phones.
- Immediate workaround without the rebuild: fully close + reopen the app on the
  stranded phone → Couple tab shows the "Linked with …" banner (hydrated by the
  now-fixed `fetchActiveCouple` from #096) → tap it → dashboard.
- Completes the couple-link UX fixes (#095 pending realtime/poll, #096 the
  broken-embed root cause, #097 this Setup-screen advance).
