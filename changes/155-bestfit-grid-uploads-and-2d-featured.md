# Upload Best Fit images + wire the home grid + restore Featured 2D headline

**Date:** 2026-05-25
**Type:** feature

## Problem

The owner's hand-picked category images (painting/football/studying/dance/cooking/gardening/
playing-game) and the 2D Kawaii headline existed only locally — verified NOT in Supabase
(every UUID `.png` returned 404 while the original `…/001.webp` returned 200). So the Best
Fit grid couldn't reference them, and the 2D card had gone black.

## Solution

1. **Uploaded** (after the owner added `SUPABASE_SERVICE_ROLE_KEY` to `.env`, renamed from a
   mislabeled `service_role key`): `scripts/upload-bestfit-images.mjs` pushed all 7 category
   folders → `wallpapers/category/<key>/` and the 2D folder → `wallpapers/2d/nervous/` —
   **95 files, 0 failed**, verified public (200).
2. **Best Fit grid** (`constants/mockData.ts`) rebuilt as an explicit list (helpers
   `bfPhoto(key,file)` for uploaded picks, `catPhotos(key,n)` for kept catalog tiles), per
   the owner's spec — other tiles unchanged:
   - Painting: keep #1, then `a3a932eb`, `734f7490`
   - Playing-game (NEW, after Painting): `05d13085`, `7d3379b3`, `536a274e`
   - Football #3 `ddae626d` · Studying #3 `fd3a40c4` · Dance #3 `cd3c4e31` (keep #1/#2)
   - Cooking #1 `86ada00c`, #2 `93496523`, keep one
   - Gardening (replaces Photography): `bcc748f2`, `ac6aefc2`, `3813c364`
   - Remain-as-is: Stylish, Love, Mixed, Happy
3. **Featured "2D Kawaii"** re-pointed to the now-uploaded
   `wallpapers/2d/nervous/33bfb1fb…png` (reverses change 154's temporary fallback).
4. `getPhotoById` resolves the new `bf-*` ids so Best Fit tiles open in the preview (free
   apply — these are NOT premium).

## Files changed

- `scripts/upload-bestfit-images.mjs` (new), `constants/mockData.ts`

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed**. Upload: 95/95 public (200). Build +
on-device: see commit.

## Notes

- `.env` now holds `SUPABASE_SERVICE_ROLE_KEY` (gitignored, not bundled). It was mislabeled
  `service_role key` (invalid var name); renamed so scripts read it.
- Row order follows the owner's mention order; tiles can be re-curated by editing the
  `bestPicks` list. Best Fit images are FREE (premium stays in its own tab).
