# Set the Featured premium headline to a hand-picked image

**Date:** 2026-05-25
**Type:** tweak

## Problem

The Featured carousel's "Premium" card used `premiumPhotos[0]` (the first uploaded file).
The owner picked a specific image to headline: `6cfe0872-39df-4ffc-962e-8aacf4058e18.png`.

## Solution

- `constants/premiumCatalog.ts` — added `FEATURED_PREMIUM_ID =
  'premium-6cfe0872-39df-4ffc-962e-8aacf4058e18'` (documented as the swappable hero pick).
- `constants/mockData.ts` — the `featured` builder now uses
  `premiumPhotoById(FEATURED_PREMIUM_ID) ?? premiumPhotos[0]` (falls back to the first if the
  id is ever absent).

## Files changed

- `constants/premiumCatalog.ts`, `constants/mockData.ts`

## Verification

File confirmed present in `PREMIUM_FILES` (and uploaded, change 149). `tsc --noEmit` → **0
errors**. Build + on-device: see commit.

## Notes

- To change the headline again, edit the one `FEATURED_PREMIUM_ID` constant to another
  `premium-<uuid>` id.
