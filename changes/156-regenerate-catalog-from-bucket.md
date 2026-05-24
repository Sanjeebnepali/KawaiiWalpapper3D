# Regenerate the wallpaper catalog from the live bucket (all 525 images)

**Date:** 2026-05-25
**Type:** feature

## Problem

The bucket holds **585 images** (category 281, mood 169, 2d 75, premium 60), but
`constants/wallpaperCatalog.ts` referenced only a curated subset per section — so most
uploaded images (including the 95 added today) never appeared in any category / mood / 2D
screen. The owner wants all of them shown.

## Solution

Refresh the generator's source from the live bucket, then regenerate (the catalog is
auto-generated from `image-pipeline/manifest.json` via `gen-catalog.js`):

- `image-pipeline/refresh-manifest-from-bucket.mjs` (new) — lists every `mood/*`,
  `category/*`, `2d/*` folder with the service_role key and rebuilds each section's `items`
  to include ALL files. Sort order: numbered originals first (by number), then the rest
  (UUID uploads) — so existing `<group>-<key>-N` ids stay stable and new files append. Keeps
  each section's label/tier/order. (Premium is separate — handled by `premiumCatalog.ts`.)
- Ran it → manifest now lists **525** photos; then `node image-pipeline/gen-catalog.js`
  regenerated `constants/wallpaperCatalog.ts` (**29 sections, 525 photos**, up from the
  prior subset).

Every category/mood/2D browse screen now shows the full uploaded set; `catalogById`,
`sectionByKey`, the Best Fit "keep" tiles, etc. all keep working unchanged.

## Files changed

- `image-pipeline/refresh-manifest-from-bucket.mjs` (new)
- `image-pipeline/manifest.json` (regenerated items)
- `constants/wallpaperCatalog.ts` (regenerated, 525 photos)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites**. Regenerated file:
`grep -c '"id":'` = 525; the new UUID painting file `a3a932eb` is present. Build +
on-device: see commit.

## Notes

- This is a data regeneration (the catalog is an auto-generated table, exempt from the file
  size cap). Re-run the two pipeline commands whenever the bucket changes.
- Premium images stay out of the catalog (subscription-only, in `premiumCatalog.ts`).
