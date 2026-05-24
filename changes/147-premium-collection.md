# Premium wallpaper collection — Supabase Storage + diamond badge + subscription gate

**Date:** 2026-05-25
**Type:** feature

## Problem

The owner has 60 curated premium wallpapers (in `~/Downloads/premium`, ~110 MB) that should
be a subscription-gated collection: uploaded to Supabase, shown in the Premium option, with
a diamond marker, and locked behind the paywall on apply.

## Solution

**Hosting (Supabase Storage, via a one-time script):** the app only ships the anon key,
which can't bulk-upload, so `scripts/upload-premium.mjs` runs with the owner's `service_role`
key (passed as `$env:SUPABASE_SERVICE_ROLE_KEY`), creates a public `premium` bucket, and
upserts every image (skipping accidental ` (1)` copies). Idempotent.

**Catalog:** `constants/premiumCatalog.ts` lists the 60 object names and builds public URLs
from `EXPO_PUBLIC_SUPABASE_URL` at runtime (`premiumPhotos`, ids `premium-<uuid>`), plus
`premiumPhotoById` + `isPremiumPhotoId`.

**Display:** `mockData` repoints `PREMIUM_SECTION` (the `/category/premium` browse) at
`premiumPhotos` with `tier: 'premium'` (falls back to free best-picks if the catalog is
empty, e.g. pre-upload), and `getPhotoById` resolves `premium-<uuid>` ids → their Storage
URL with a gold 'Premium' tag.

**Diamond badge:** `WallpaperGridCell` gains a `premium` prop rendering a gold diamond;
`app/category/[id].tsx` passes `premium={isPremiumPhotoId(item.id)}`.

**Subscription gate:** `app/wallpaper/[id].tsx` `onApplyTap` now routes premium photos
through the existing `gatePremium()` — applies immediately if the user is premium, else pops
the paywall (mock purchase sets `isPremium`). Free wallpapers apply unchanged.

## Files changed

- `scripts/upload-premium.mjs` (new), `constants/premiumCatalog.ts` (new)
- `constants/mockData.ts` (premium section + `getPhotoById`)
- `components/WallpaperGridCell.tsx` (diamond badge)
- `app/category/[id].tsx` (pass `premium`)
- `app/wallpaper/[id].tsx` (gate apply)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites**. Build + on-device: see
commit. NOTE: the images render only AFTER the owner runs the upload script — until then the
Premium grid falls back to the free best-picks (graceful), so the build is safe to ship.

## Notes / follow-ups

- **You must run the upload once:** `$env:SUPABASE_SERVICE_ROLE_KEY="..."; node
  scripts/upload-premium.mjs "C:\Users\Sanju\Downloads\premium"`.
- The long-press → "Set as Wallpaper" modal path is not yet gated (only the prominent Apply
  tap is) — a follow-up.
- Hero/Featured diamond placement on the home screen is a follow-up (this change wires the
  Premium category + preview; the home teaser still shows the free best-picks).
