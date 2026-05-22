# Theme Packs draw only category images (no mood images leaking in)

**Date:** 2026-05-22
**Type:** fix

## Problem
The owner reported that the **Theme Based / Theme Packs** surface was showing
images that belong to the **Mood Based** section (Happy, Crying, Heartbroken,
Love, …). Theme Packs are meant to show themed/activity wallpapers (Football,
Cooking, Stylish, …) only.

## Solution
Root cause was in `constants/mockData.ts`. Change #089 split the theme vs mood
album pools by **even/odd index across the WHOLE catalog**:

```js
const ALL_CATALOG_PHOTOS = catalogSections.flatMap((s) => s.photos); // category + MOOD + 2D
const POOL_THEME = ALL_CATALOG_PHOTOS.filter((_, i) => i % 2 === 0);  // <- includes mood photos
const POOL_MOOD = ALL_CATALOG_PHOTOS.filter((_, i) => i % 2 === 1);
```

That guaranteed the two pools never share the *same* image, but because the
combined catalog already contains the mood sections, the even-indexed
`POOL_THEME` was full of mood images. `themePacks` is built from `POOL_THEME`,
and `getThemePackPhotos` (Theme Packs tab + `theme-pack/[id]` detail) reads it —
so mood images surfaced there.

Fix: draw each pool from a **different catalog group** instead of an index
parity trick:

```js
const POOL_THEME = categorySections.flatMap((s) => s.photos); // themed activities only
const POOL_MOOD  = moodSections.flatMap((s) => s.photos);     // emotions only
```

Now the pools are disjoint **by construction** (different groups) *and*
semantically correct: Theme Packs only ever contain category/theme images,
Mood albums only ever contain mood images. This also satisfies the earlier
owner requirement that the two sets be "completely different from each other"
(#089) — more strongly than before, since they share no source section at all.
2D Kawaii images live in their own home row (`themes` ← `twoDSections`) and are
intentionally not part of either shuffle-album pool.

## Files changed
- `constants/mockData.ts` — replaced the even/odd `ALL_CATALOG_PHOTOS` split
  with `POOL_THEME = categorySections` / `POOL_MOOD = moodSections`. Removed the
  now-unused `ALL_CATALOG_PHOTOS` local (no other references).

## Verification
- `themePacks` (→ Theme Packs tab `wallpapers/theme-packs.tsx`, hero previews,
  and `theme-pack/[id]` detail grid) now resolve via `getThemePackPhotos` to
  category-only images — open any pack and confirm no Happy/Crying/Love/etc.
- `moodAlbums` (→ Mood tab `(tabs)/mood.tsx` album strip + `mood/pick-collection`)
  resolve to mood-only images.
- No shared image between the two: `POOL_THEME` ⊂ category, `POOL_MOOD` ⊂ mood,
  groups are disjoint.
- Imports still valid (`categorySections`, `moodSections`, `catalogSections`
  all still used elsewhere in the file).

## Notes
- JS-only change. The release APK embeds the JS bundle, so the device needs a
  rebuild (`npx expo run:android --variant release --no-bundler`) or a Metro
  reload to pick it up — no native recompile required.
- Supersedes the pool-construction half of #089 (point 5). The rest of #089 is
  untouched.
- The home "Theme Based" row was previously relabeled "2D Kawaii"
  (`ThemeBasedRow` ← `twoDSections`); it was already not pulling mood images and
  is unchanged.
