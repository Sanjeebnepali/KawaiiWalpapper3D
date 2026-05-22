# Premium home (Best Picks grid) + 5 mixed albums + keep Premium button

**Date:** 2026-05-21
**Type:** feature

## Problem

Owner feedback after changes/087: the home didn't feel premium; wants the
Zedge-style look from a reference screenshot — a big **3-column grid of tall
portrait cards** (modest ~18px radius, small gaps, dark, image-forward). Also:
keep the **Premium** button (the rewire dropped it), put the **best** images on
the home (painting especially) and drop **gym/yoga** from the hero (already in
the category row), and Theme Packs / Mood-based still showed placeholder images.

## Solution

**Premium home (`BestPicksGrid` + `app/(tabs)/index.tsx`):**
- New `components/BestPicksGrid.tsx` — 3-column grid of big tall cards
  (`aspectRatio 0.52` ≈ 1:1.9, `borderRadius 18`, `gap 8`), modelled on the
  reference. Embedded in the home FlatList (`scrollEnabled=false`).
- New `bestPicks` in `mockData` — curated: **painting**, stylish, photography
  (lead), then love, 2D mixed, dance, cooking, happy. 18 photos (6 even rows).
  **gym/yoga intentionally excluded** (they stay in the category row). Editable
  via the `BEST_PICKS` list.
- Home restructured: CategoryIcons → **Best Picks** grid → 2D Kawaii row →
  Moods. Removed the busy 4-thumb `CategoryPreviewList` rows and the
  `FeaturedCarousel` (replaced by the cleaner Best Picks grid). "See all" on
  Best Picks → the Premium browse.

**Keep the Premium button:**
- `categoryIcons` re-appends a `premium` entry (diamond, gold).
- `resolveBrowse('premium')` → a synthetic `PREMIUM_SECTION` whose photos are
  `bestPicks`; `browseMeta('premium')` → title "Premium", gold accent. So the
  Premium button opens the curated best (all free for now).

**5 mixed albums (Theme Packs + Mood-based) — `themePacks`/`getThemePackPhotos`:**
- `themePacks` rewritten to **5 albums** (`album-1..5`: Daily Mix / Cute Picks /
  Soft & Dreamy / Bold & Bright / Editor's Set), each **exactly 10 real images**
  mixed from across the whole catalog (stride-43 + per-album offset for variety;
  no dupes within an album). `ThemePack` gains `photoIds: string[]`.
- `getThemePackPhotos(packId)` now returns the album's real catalog photos.
  Because the Theme Packs tab, theme-pack screen, shuffle pools, AND the
  Mood-based pool builder all read `themePacks`/`getThemePackPhotos`, both
  surfaces now show real images with 5×10 albums.

## Files changed
- `components/BestPicksGrid.tsx` (new) — 3-col premium grid.
- `app/(tabs)/index.tsx` — Best Picks hero; dropped previews + carousel; Premium
  "see all".
- `constants/mockData.ts` — `bestPicks` + `PREMIUM_SECTION`; `resolveBrowse`/
  `browseMeta` handle `premium`; `categoryIcons` re-adds Premium; `themePacks`
  → 5 mixed albums (+ `photoIds`); `getThemePackPhotos` resolves album photos.

## Verification
- `tsc --noEmit`: 0 errors in changed files (9 remaining are pre-existing in
  untouched files).
- On device after this `run` rebuild: home shows a big 3-col Best Picks grid
  (painting/stylish/photography first, no gym/yoga); Premium button present in
  the category row → opens the best picks; Theme Packs tab shows 5 albums of 10
  real images; building a Mood pool from an album uses real images.

## Notes
- "Best" is curated by category (can't auto-judge image quality) — owner can
  hand-pick by editing `BEST_PICKS`, and which image headlines each is just the
  first of each section.
- Background stays the app's dark theme (`#131313`); the premium feel comes from
  the big image-forward grid (didn't override the global theme bg).
- `FeaturedCarousel` + `CategoryPreviewList` components remain on disk, just
  unused by the home now.
- Still pending (task #6): Mood-by-time ENGINE auto-seeding a default collection
  so it auto-applies real images while closed; surfacing the extra emotion moods
  as picker moods. Ships in the release APK on this `run`.
