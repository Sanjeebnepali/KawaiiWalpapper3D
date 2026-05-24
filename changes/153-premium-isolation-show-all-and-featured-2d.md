# Show all 60 premium · keep premium subscription-only · Featured 2D headline

**Date:** 2026-05-25
**Type:** fix

## Problem

1. The Premium grid showed only **30** of the 60 images — the category screen caps at 30.
2. Premium (subscription) images had leaked into the FREE home **"Best Fit"** section + its
   "See all", where anyone could apply them. Premium must stay subscription-only.
3. The owner wants a specific new 2D image as the Featured **"2D Kawaii"** headline.

## Solution

1. **Show all premium** — `app/category/[id].tsx` requests `120` items for `premium`
   (30 for everything else), so the whole 60-image collection renders.
2. **Premium kept separate from free**:
   - `components/BestPicksGrid.tsx` reverted to `bestPicks` (FREE curated) — the home
     "Best Fit" teaser no longer shows premium images.
   - `app/(tabs)/index.tsx` — "Best Fit" See-all now → `/category/bestfit` (a new FREE
     browse), not `/category/premium`.
   - `constants/mockData.ts` — removed `premiumHomePicks`; added a free `BESTFIT_SECTION`
     (= `bestPicks`) resolved by `resolveBrowse('bestfit')`. Premium now lives ONLY in the
     Premium Collection tab (`/category/premium`) + the clearly-marked, paywall-gated
     Featured "Premium" card.
3. **Featured 2D Kawaii** — `mockData` `featured` builder special-cases the `'2D Kawaii'`
   tag to use `FEATURED_2D_IMAGE` (`wallpapers/2d/nervous/33bfb1fb-…png`, FREE) with id
   `featured-2d-nervous`; `getPhotoById` resolves that id for the preview. Added
   `scripts/upload-file.mjs` (generic single-file uploader) to put that image in the bucket.

## Files changed

- `app/category/[id].tsx`, `app/(tabs)/index.tsx`
- `components/BestPicksGrid.tsx`
- `constants/mockData.ts`
- `scripts/upload-file.mjs` (new)

## Verification

`tsc --noEmit` → **0 errors** (no dangling `premiumHomePicks`). `jest` → **144 passed**.
Build + on-device: see commit.

## Notes / action

- **Upload the Featured 2D image** (else that one Featured card is blank):
  `$env:SUPABASE_SERVICE_ROLE_KEY="…"; node scripts/upload-file.mjs
  "C:\Users\Sanju\Downloads\nervus--2d--walpapper\33bfb1fb-45c8-4eaa-8092-7f426b8040ac.png"
  "2d/nervous/33bfb1fb-45c8-4eaa-8092-7f426b8040ac.png"`
- Premium images now appear ONLY where they're gated (Premium tab + Featured premium card),
  never in the free Best Fit / its See-all.
