# Real wallpapers: Supabase catalog + new taxonomy (Video → 2D Kawaii)

**Date:** 2026-05-21
**Type:** feature

## Problem

Every image in the app was a `picsum.photos` placeholder — off-niche and not
premium. The owner supplied ~420 real AI baby/kawaii wallpapers (28 folders in
Downloads) and wanted: real images everywhere, **themed categories** (Football,
Gym, Yoga, Studying, Dance, …), the **Video** section replaced with **2D
Kawaii**, a **premium-feeling home**, and Mood-by-time pulling real images. The
Couple page must stay untouched (owner adds those later).

## Solution

**Pipeline (`image-pipeline/`, isolated — own sharp install):**
- `mapping.js` — single source of truth: each Downloads folder → group
  (`mood` | `category` | `2d`), key, label, tier. All `free` for now.
- `optimize.js` — converts every PNG → WebP @≤1080px. **777 MB → ~42 MB.**
  Originals untouched. Emits `manifest.json`.
- `gen-catalog.js` — manifest → `constants/wallpaperCatalog.ts` (29 sections,
  430 photos) with deterministic Supabase public URLs.
- `upload.js` — created a public `wallpapers` Storage bucket and uploaded all
  430 WebP (verified: 200, image/webp). Uses the service_role key from the
  environment only (never written to disk/committed).

**App rewire — `constants/mockData.ts` became an adapter over the catalog**
(export shapes preserved so components keep working, only the data changed):
- `categoryIcons` / `categoryMeta` derive from `categorySections` (14 themed
  categories, each with an Ionicons glyph + accent). `CategoryId` is now
  `string`.
- `resolveBrowse(id)` + `browseMeta(id)` + `getCategoryPhotos(id)` resolve a
  composite browse id (`category-football`, `mood-love`, `2d-mixed`) or a bare
  category key — one generalized `/category/[id]` screen now browses
  categories, moods, AND 2D sets.
- `featured` = a **curated premium hero** (`FEATURED_PICKS`, editable) spanning
  Stylish / Love / Photography / 2D / Dance / Happy.
- `collections` = the **mood/emotion** sets (Home "Moods" grid).
- `themes` = the **2D Kawaii** sets (Home "2D Kawaii" row).
- `getPhotoById` resolves catalog ids via `catalogById` first (so preview /
  favorites / shuffle history all show the real image).
- `searchCatalog` rebuilt from the catalog (also feeds the shuffle + mood-pool
  pickers).
- `getMoodPhotos` (Mood tab custom-pair picker) repointed to catalog moods.
- `constants/moods.ts` `getMoodWallpapers` repointed; the 7 face/picker MoodIds
  map to the nearest real folder (sad→crying, surprised→confused, neutral→calm).

**Taxonomy / navigation:**
- Top tabs: **Video → 2D Kawaii**; `TopTabs` routes it to `/wallpapers/2d-kawaii`.
- New `app/wallpapers/2d-kawaii.tsx` (grid of all 2D photos); deleted
  `app/wallpapers/video.tsx`; `_layout.tsx` route renamed.
- `CategoryIcons` is now a horizontal scroll (14 categories) with real glyphs.
- `CategoryPreviewList` previews the first 6 categories (light first paint).
- Home "See all" targets fixed: Featured→/category/stylish, 2D→2D screen,
  Moods→Mood tab.

## Files changed
- `image-pipeline/*` (new): mapping/optimize/gen-catalog/upload + package.json.
- `constants/wallpaperCatalog.ts` (new, generated).
- `constants/mockData.ts` — adapter over the catalog (see above).
- `constants/moods.ts` — `getMoodWallpapers` → catalog (+ MoodId map).
- `components/CategoryIcons.tsx` — scrollable, real glyphs.
- `components/CategoryPreviewList.tsx` — subset + use icon tint.
- `components/ThemeBasedRow.tsx`, `CollectionGrid.tsx` — open `/category/<id>`.
- `components/TopTabs.tsx` — 2D route.
- `app/(tabs)/index.tsx` — section titles + "see all" targets.
- `app/category/[id].tsx` — generalized via `browseMeta`/`browseId`.
- `app/wallpapers/2d-kawaii.tsx` (new); `app/wallpapers/video.tsx` (deleted).
- `app/_layout.tsx` — route swap.

## Verification
- `tsc --noEmit`: 0 errors in any changed file (9 remaining errors are all
  pre-existing in untouched files — ai.tsx, couple.ts, wallpaperActions.ts, …).
- Public URL check: `…/wallpapers/mood/happy/001.webp` → 200, image/webp.
- On device after a release rebuild: Home shows real images (Featured hero,
  category previews, 2D row, Moods grid); category/mood/2D browse grids load
  from Supabase; wallpaper preview + set work.

## Notes
- **Still on placeholders (tracked, changes-followup task #6):** the Theme Packs
  top tab + theme-pack screens + shuffle pools + mood-pool builder
  (`getThemePackPhotos`); and the Mood-by-time ENGINE applies from a user-built
  Mood Collection, so to apply real images while closed it needs a default
  mood collection auto-seeded from the catalog. Surfacing love/heartbroken/
  nervous/confused/crying as first-class picker moods is also pending.
- Couple page intentionally untouched (`couplePacks.ts` still uses `picLarge`).
- All tiers `free`; flip `mapping.js` rows to `premium` + regenerate later.
- Owner pasted the service_role key in chat — recommended they rotate it.
- Ships in the release APK on next `run` (JS embedded), alongside changes/085
  (Day-based) + 086 (mood schedule).
