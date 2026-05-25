# Mood-notification tap applies (default pool fallback) + couple-chain verify

**Date:** 2026-05-25
**Type:** fix

## Problem

Three user reports:
1. **Couple subscription chain** — worry that an inherited (non-paying) partner
   could unlink, generate their own code, and pass the unlock down a chain.
2. **Tapping a mood on a notification did nothing** — friend check-in / daily
   mood prompt shows mood buttons (Happy/Calm/…); tapping one didn't change the
   wallpaper.
3. **Shuffle "shows some delay / misbehaves"** (vague — pending specifics).

## Diagnosis

1. **Couple chain is already prevented** (no code change needed). The relock
   (`reconcileCoupleEntitlement(false)`) fires from BOTH unlink buttons
   (`app/couple/dashboard.tsx`, `app/couple/linking.tsx`), the realtime
   `status→unlinked` handler, and the cold-start reconcile in
   `coupleBootstrap`. So an `'inherited'` partner's `isCouplePremium` flips
   false on unlink, and `createCoupleCode` gates on `hasCouplePremium()` — they
   can't generate a code. The chain is broken: an unlinked partner must either
   subscribe themselves or re-enter a real subscriber's code.
2. **Tap-does-nothing** was a silent no-op in `moodNotifications.handleResponse`:
   `if (!state.moodCollectionId) return;`. Friend check-in / daily prompts can
   be enabled WITHOUT ever building a mood pool, so a tap had no collection (and
   thus no photos) to apply from — it returned silently. `applyMoodPhotoFromCollection`
   also bails on an empty collection.

## Solution

Added `ensureMoodCollectionId()` (`lib/moodEngineActions.ts`): returns the
current mood pool if it exists and has photos, otherwise **materializes a
default built-in mood album** (via `ensureBuiltinPackCollection`) and persists
it as the mood pool. `handleResponse` now resolves the pool through it, so a
mood tap ALWAYS applies a mood-matching wallpaper — even for users who never
built a pool. Added a `__DEV__` warning for the genuinely-no-albums case.

No code change for the couple chain (verified correct) or shuffle (needs the
user to say which symptom — delay before change / late when idle / preview lags
the real wallpaper / unexpected changes).

## Files changed

- `lib/moodEngineActions.ts` — `ensureMoodCollectionId()` + mockData imports.
- `lib/moodNotifications.ts` — `handleResponse` uses the fallback resolver.

## Verification

- `npx tsc --noEmit` → 0 errors.
- **Needs a rebuild** to land in the release APK (JS is embedded).
- On-device: enable Friend check-in (or Daily mood) WITHOUT building a pool →
  tap a mood on the notification → the wallpaper changes to a matching photo
  from the default mood album.

## Notes

- If a tap still does nothing while the app is fully killed, the OEM is blocking
  the background notification response; it's re-processed via
  `getLastNotificationResponseAsync` on next app open, and enabling Settings →
  Background Access fixes the background case.
- **Couple chain — the only theoretical bypass** is a modified client (the gate
  is client-side). Closing that needs SERVER-side entitlement enforcement (an
  `entitlements` table + the `create_couple` RPC checking it), which arrives
  with real billing — local mock purchases give the server nothing to check yet.
