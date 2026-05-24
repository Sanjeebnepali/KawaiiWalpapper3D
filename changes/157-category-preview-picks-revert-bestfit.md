# Put hand-picked images in the category-preview rows; revert Best Fit to normal

**Date:** 2026-05-25
**Type:** fix

## Problem

Changes 155 put the owner's hand-picked images into the home **Best Fit** grid. That was
the wrong spot — the owner wants them in the **category-preview rows** (the section after the
category icons that previews painting / football / etc.), and wants **Best Fit left with its
normal images** ("it already best with normal images").

## Solution

1. **Revert Best Fit** (`constants/mockData.ts`) — `bestPicks` back to the original
   `BEST_PICKS` slices of normal catalog images; removed the `bfPhoto`/`catPhotos` helpers
   and the now-unneeded `bestPicks.find` branch in `getPhotoById` (the picks are plain
   catalog photos now, resolved via `catalogById`). Added `findCategoryPhoto(key, file)` to
   locate a specific uploaded image in a category by filename stem.
2. **Category-preview rows** (`components/CategoryPreviewList.tsx`) — `PREVIEW_KEYS` is now
   `painting, playing-game, football, studying, dance, cooking, gardening` (playing-game
   added after painting; gardening replaces photography). A `PREVIEW_PICKS` map places the
   owner's images in the exact slots:
   - Painting #2 `a3a932eb`, #3 `734f7490`
   - Playing-game #1–3 `05d13085` / `7d3379b3` / `536a274e`
   - Football #3 `ddae626d` · Studying #3 `fd3a40c4` · Dance #3 `cd3c4e31`
   - Cooking #1 `86ada00c`, #2 `93496523`
   - Gardening #1–3 `bcc748f2` / `ac6aefc2` / `3813c364`
   Slots without a pick keep the category's leading catalog image. All tiles are catalog
   photos (resolvable ids → preview opens correctly).

## Files changed

- `constants/mockData.ts` (revert bestPicks; `findCategoryPhoto`; getPhotoById cleanup)
- `components/CategoryPreviewList.tsx` (preview keys + per-slot picks)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed**. All 13 picked files confirmed
present in the regenerated catalog (grep = 1 each), so `findCategoryPhoto` resolves them.
Build + on-device: see commit.

## Notes

- The category-preview rows sit right after the icon strip on Home — far more visible than
  Best Fit (which is the last section). The picks now show there.
- Best Fit is unchanged from the original curated normal images.
