
# Remove low-quality images from the 2D Kawaii section

**Date:** 2026-05-26
**Type:** chore

## Problem

The owner reviewed the "2D Kawaii" section (the first set on the 2D Kawaii
screen, reached from Home's "2D Kawaii" card) and judged images 3–8 to be
poor quality / off-brand — they don't fit the app's look. Only the first two
images should remain.

## Solution

Removed the six photo entries `2d-mixed-3` … `2d-mixed-8` from the "2D Kawaii"
(`group: '2d'`, `key: 'mixed'`) section in `constants/wallpaperCatalog.ts`,
leaving `2d-mixed-1` and `2d-mixed-2`. The catalog is the single source of
truth — `twoDSections` (used by `app/wallpapers/2d-kawaii.tsx`) flattens the
2D sections in catalog order with the mixed section first, so the screen's
first eight grid positions were exactly these images. No other module
referenced the removed ids:

- Favorites are in-memory only (no persisted dangling refs).
- The only other match for `2d-mixed-[3-8]` was `image-pipeline/manifest.json`,
  a build-time artifact not imported at runtime, so it was left untouched.

## Files changed

- `constants/wallpaperCatalog.ts` — deleted the `2d-mixed-3`…`2d-mixed-8`
  photo objects from the "2D Kawaii" (mixed) section.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx jest constants/__tests__/catalogDedupe.test.ts` → **5 passed**.

## Notes

- The underlying files (`wallpapers/2d/mixed/003.webp` … `008.webp`) still
  exist in the Supabase bucket; they're now simply unreferenced. They can be
  deleted from storage later if desired, but leaving them is harmless.
- JS/data-only change — no native rebuild required; a Metro reload picks it up.
