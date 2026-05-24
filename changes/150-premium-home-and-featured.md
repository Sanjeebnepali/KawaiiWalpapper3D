# Show the premium collection in the home Premium grid + Featured headline

**Date:** 2026-05-25
**Type:** fix

## Problem

After wiring the premium collection (147–149), two surfaces still showed the OLD free
images:

1. The home **"Premium" teaser grid** (`BestPicksGrid`) still rendered `bestPicks` (free
   curated category images) — only the `/category/premium` screen had been repointed.
2. The **Featured** carousel's "Premium"-tagged card pulled its image from the free
   `stylish` category, not the new premium collection.

## Solution

- `constants/mockData.ts` — added `premiumHomePicks` (first 12 of `premiumPhotos`, falling
  back to `bestPicks` pre-upload); the `featured` builder now makes the `'Premium'`-tagged
  entry use `premiumPhotos[0]` with a gold accent + `premium: true` + the `premium-<uuid>`
  id (so tapping it opens the gated premium preview).
- `constants/mockData.types.ts` — `FeaturedItem` gains `premium?: boolean`.
- `components/BestPicksGrid.tsx` — renders `premiumHomePicks` instead of `bestPicks`, so
  the home Premium section shows the real collection (cells open `/wallpaper/premium-…`,
  which is paywall-gated on apply).
- `components/GlassCard.tsx` + `components/FeaturedCarousel.tsx` — a `premium` prop swaps
  the Featured card's tag dot for a gold diamond.

## Files changed

- `constants/mockData.ts`, `constants/mockData.types.ts`
- `components/BestPicksGrid.tsx`, `components/GlassCard.tsx`, `components/FeaturedCarousel.tsx`

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites**. Build + on-device: see
commit. The premium images are already uploaded + verified public (change 149), so these
surfaces render the real collection.

## Notes

- The Featured premium card uses `premiumPhotos[0]` (the first uploaded file). To headline a
  specific "best" image, tell me the filename and I'll point it there — it's one line.
