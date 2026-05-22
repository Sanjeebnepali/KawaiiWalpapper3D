# 095 — Fix couple creator stuck on "Waiting for partner" after link

**Date:** 2026-05-22
**Type:** fix

## Problem

When the partner (Person B) accepts a code, their side links and shows the
dashboard, but the **creator's** (Person A) phone stays stuck on the
"Waiting for your partner…" screen and never opens the connected dashboard.

## Root cause

`app/couple/linking.tsx` (the waiting room) relies on the bootstrap realtime
channel being open so that when the partner accepts, the `couples` UPDATE flips
the store status → `linked` and its `useEffect` navigates to the dashboard.

But the bootstrap store-subscriber in `lib/coupleBootstrap.ts` was:

```js
if (state.link?.status === 'linked' && a) enterLinkedMode(...);
else exitLinkedMode();   // ← 'pending' fell here
```

When `createCoupleCode` sets the link to **`pending`** in-session, the
subscriber hit the `else` and called `exitLinkedMode()`, which
**unsubscribes realtime**. So a freshly-created pending couple had NO open
channel, and the creator never received the partner's accept. (The `pending`
realtime subscription only existed in `syncForUser`, which runs on cold boot —
not when you generate a code in the same session.) The partner's side worked
only because `acceptCoupleCode` navigates directly, not via realtime.

## Solution

Two layers — fix the cause, and add a safety net:

1. **Keep realtime open for pending couples** (`lib/coupleBootstrap.ts`). New
   `enterPendingMode(code)` opens (only) the realtime channel — no location
   task, since there's no partner to be near yet. The store subscriber now
   routes `pending` → `enterPendingMode` instead of `exitLinkedMode`. A new
   `subscribedCode` module var dedups so the subscriber and `syncForUser` can't
   double-open the channel; it's set in `enterLinkedMode`/`enterPendingMode`
   and cleared in `exitLinkedMode`.

2. **Safety-net poll in the waiting room** (`app/couple/linking.tsx`). While
   `pending`, poll `fetchActiveCouple()` every 3 s; if it comes back `linked`,
   push it into the store (which fires the existing navigate-to-dashboard
   effect). This guarantees the creator advances within a few seconds even if
   realtime is delayed or the project's realtime is unavailable. Stops on link
   / unmount.

## Files changed
- `lib/coupleBootstrap.ts` — `subscribedCode` tracker; `enterPendingMode`;
  store subscriber routes `pending` to it; `syncForUser` pending branch reuses
  it; `subscribedCode` set/cleared in enter/exit.
- `app/couple/linking.tsx` — 3 s fallback poll of `fetchActiveCouple` while
  pending; imports `fetchActiveCouple` + `useCoupleStore`.

## Verification

1. Rebuild the release APK and install on both phones.
2. Phone A: Couple → Generate code → Continue → "Waiting for your partner…".
3. Phone B: Couple → enter A's code → Link. B lands on the dashboard.
4. **Phone A now auto-advances to the dashboard within ~1–3 s** (realtime if
   available, otherwise the poll) — no longer stuck.
5. Cold-boot regression: kill + reopen A while still pending → still advances
   when B accepts (syncForUser path unchanged, just refactored).

## Notes

- JS-only change → needs a release rebuild to land on the installed APK (no
  Metro on the release variant).
- The poll is a backstop, not the primary path; if realtime works it advances
  instantly and the poll usually never fires before navigation unmounts it.
- Separate from the wallpaper-not-applying question (that needs both phones to
  grant "Allow all the time" location so proximity can be computed) — tracked
  in conversation, not this change.
