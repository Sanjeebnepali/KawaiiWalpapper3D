# 167 — Category WebP/PNG de-duplication + subscription login gate

Two unrelated user-reported fixes in one session.

## Problem

1. **Category photos showed twice.** Opening certain category grids (Football,
   Painting, Studying, Dance, Cooking, Gardening, Playing-game, and 2D/Nervous)
   rendered every wallpaper a second time.
2. **Guests could subscribe without logging in.** The subscription page ran the
   purchase (flipping the local entitlement flags) with no auth check, so a
   not-signed-in user could "Start free trial" and unlock premium areas.

## Root cause

1. The bucket folders for those categories hold BOTH the optimized `NNN.webp`
   exports AND the original `<uuid>.png` source images of the **same**
   wallpapers (the PNG originals leaked back into the bucket after the WebP
   optimize pass). `wallpaperCatalog.ts` is a faithful inventory of the bucket
   (`refresh-manifest-from-bucket.mjs`), so each image was listed twice.

   Verified pixel-for-pixel by downloading and viewing pairs:
   `football/001.webp` == `04c53f78….png`, `football/002.webp` == `27958546….png`,
   `painting/001.webp` == `0c2c3b42….png`, `painting/010.webp` == `b6904e7a….png`.
   In all 8 affected sections the sorted WebP list and sorted PNG list are the
   same images in the same order, and `webp_count >= png_count`, so the WebP set
   is the canonical, complete superset — every PNG has a WebP, never the reverse.

2. `app/subscription.tsx:onSubscribe` called `purchasePlans(...)` directly. The
   app HAS an auth system (`store/auth.ts`, `useRequireAuth`) used by favorites /
   AI generation / couple pairing, but the subscription flow never invoked it.

## Solution

1. New pure helper `constants/catalogDedupe.ts` → `dedupeCatalogPhotos(photos)`:
   if a photo set contains any `.webp`, return only its `.webp` photos; a
   PNG-only set (e.g. the premium collection, `premiumCatalog.ts`) is returned
   untouched. Applied in:
   - `getCategoryPhotos` (`constants/mockData.ts`) — dedupe **before** slicing so
     `count` reflects unique wallpapers. Fixes the `/category/[id]` grid.
   - `searchCatalog` (`constants/mockData.search.ts`) — the same list backs the
     shuffle + mood-pool photo pickers, so those stop offering doubles too.
2. `app/subscription.tsx` now wraps both the purchase and "Restore purchases" in
   `useRequireAuth().requireAuth(...)`. Guests can still browse plans/prices
   (good for conversion) but get a "Sign in to subscribe" prompt the moment they
   try to buy/restore; authed users proceed immediately. `purchasePlans` is only
   called from this one handler, so the gate fully covers the purchase path.

## Files changed

- `constants/catalogDedupe.ts` (new) — the dedupe helper + `isWebp` detail.
- `constants/mockData.ts` — import + use in `getCategoryPhotos`.
- `constants/mockData.search.ts` — import + use in `searchCatalog`.
- `app/subscription.tsx` — `useRequireAuth` gate on subscribe + restore.
- `constants/__tests__/catalogDedupe.test.ts` (new) — 5 cases incl. a real-
   catalog assertion (no image survives twice; webp sections become webp-only).

## Verification

- `npx jest` → **162 passed** (11 suites), including the new dedupe suite.
- `npx tsc --noEmit` → exit 0, no new errors.
- Real-catalog dedupe check (node script): exactly the 8 mixed sections collapse
  to their WebP-only counts (football 20→10, studying 24→12, dance 17→9,
  cooking 31→16, gardening 30→15, painting 20→10, playing-game 32→16,
  2d/nervous 18→9); total 525→430. No other section changes; premium (PNG-only)
  untouched.
- Login route `app/(auth)/login.tsx` exists; auth statuses (`loading`/`anon`/
  `authed`) match what `useRequireAuth` handles.

## Notes

- The home "category preview" rows and `bestPicks` are unchanged: both already
  read only the first few photos (the WebPs, which sort first) and
  `CategoryPreviewList` still resolves the owner's hand-picked PNGs via
  `findCategoryPhoto` against the untouched catalog.
- This is a read-side fix; the catalog/bucket still physically carries both
  formats. Durable cleanup (deleting the PNG originals from the bucket, then
  `refresh-manifest` + `gen-catalog`) is a follow-up needing service_role bucket
  access — not done in-session.
- Entitlement flags live in the settings store (AsyncStorage), not per-user, so
  they aren't cleared on logout. Tying entitlements to the account on
  sign-out/restore is a separate concern for the real-billing (RevenueCat) wiring.
- JS-only; no native rebuild needed (re-embed the bundle via `run` to ship).
