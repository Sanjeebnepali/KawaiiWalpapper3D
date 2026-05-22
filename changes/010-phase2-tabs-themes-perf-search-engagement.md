# Phase 2: new tabs, premium themes, perf, search, engagement

**Date:** 2026-05-15
**Type:** feature

## Problem

`DEVELOPMENT_BRIEF.md` (Phase 2) asked for 7 improvements. This change
delivers the 5 that need no native rebuild — Tasks 1, 2, 3, 6, 7. Tasks 4
(video playback, needs `expo-video`) and 5 (dual-wallpaper native module)
are deferred to a follow-up.

## Solution

**Task 1 — Couple Theme + Mood Based screens.** The brief's diagram put
these in the bottom tab bar, but `CLAUDE.md` hard-pins that to three tabs.
Resolved (per user) by adding them to the **TopTabs** strip on Home instead
— same pattern as Video/Dual/Theme Packs. New `app/wallpapers/couple-theme.tsx`
(romantic 2-col grid) and `app/wallpapers/mood-theme.tsx` (2-col grid with a
mood filter-chip row: Happy/Calm/Romantic/Focused/Dreamy/Cozy). Mock data,
`TopTabs` routes, and `_layout.tsx` Stack entries (`slide_from_right`) added.

**Task 2 — 8 premium themes.** `constants/theme.ts` gains a `Themes` catalog
(Kawaii Dark + Sunset Gradient, Ocean Blue, Forest Green, Purple Cosmic, Rose
Gold, Aurora Lights, Midnight Neon, Lavender Dreams) — each a full token set.
New `components/ThemePicker.tsx` renders gradient preview tiles with a
checkmark on the active one; selection persists to `store/settings.ts`. Shown
in a new "Premium Themes" Settings section; the old Alert-style theme picker
was removed. NOTE: threading tokens through every screen via a ThemeProvider
context is the remaining wiring — picker + persistence are done.

**Task 3 — performance.** `useFetchWallpapers` now derives data with `useMemo`
(synchronous source) — no more `loading:true` spinner flash, which was the
visible "2-3s pause" on tab switch. All grid `FlatList`s got
`removeClippedSubviews` + `initialNumToRender` + `maxToRenderPerBatch` +
`updateCellsBatchingPeriod` + `windowSize`. New memoized
`components/WallpaperGridCell.tsx` (self-contained favorite state so a heart
toggle re-renders one cell, not the list). `expo-image` now uses
`cachePolicy="memory-disk"` on grid images. `CategoryPreviewList` memoizes its
per-category photo arrays.

**Task 6 — search & filter.** New `hooks/useSearch.ts` (debounced query) and
`hooks/useFilter.ts` (multi-select chips). `constants/mockData.ts` gains a
unified `searchCatalog` + `searchWallpapers()` + `searchCategories`. New
`app/search.tsx`: autofocus input, category filter chips with "Clear All",
live result count, "No results" empty state, 2-col results grid. The Home
header search box is now a `Pressable` that routes to `/search`.

**Task 7 — engagement.** `collections` and `themes` mock data gain a `badge`
field (NEW / Trending / Hot). `CollectionGrid` and `ThemeBasedRow` render the
badge pill and are now tappable (route to `/theme-pack/[id]`). The Home
`SectionTitle` "See all" CTAs are wired (Featured → Popular, Theme Based &
Popular Collections → Theme Packs).

## Files changed

- `constants/mockData.ts` — couple/mood data, badges, unified search catalog + helpers, `getPhotoById` now resolves any `slug-N` id
- `constants/theme.ts` — `Themes` catalog (9 themes) + `ThemeDef` type + helpers
- `store/settings.ts` — unchanged API; `theme` field now holds a premium theme name
- `app/wallpapers/couple-theme.tsx` — NEW
- `app/wallpapers/mood-theme.tsx` — NEW
- `app/search.tsx` — NEW
- `components/WallpaperGridCell.tsx` — NEW (memoized shared grid cell)
- `components/ThemePicker.tsx` — NEW (gradient preview-tile selector)
- `hooks/useSearch.ts`, `hooks/useFilter.ts` — NEW
- `hooks/useFetchWallpapers.ts` — `useMemo`-derived, no loading flash
- `components/TopTabs.tsx` — routes for the two new screens
- `components/Header.tsx` — search box → `Pressable` routing to `/search`
- `components/CategoryPreviewList.tsx` — memoized photos + `cachePolicy`
- `components/CollectionGrid.tsx` — badges, navigation, `cachePolicy`
- `components/ThemeBasedRow.tsx` — badges, navigation, `cachePolicy`
- `app/_layout.tsx` — Stack entries for couple-theme, mood-theme, search
- `app/(tabs)/index.tsx` — wired `onSeeAll` CTAs
- `app/(tabs)/profile.tsx` — Premium Themes section, old theme modal removed
- `app/category/[id].tsx` — uses `WallpaperGridCell` + FlatList perf props
- `app/wallpapers/{video,dual,theme-packs}.tsx`, `app/theme-pack/[id].tsx` — FlatList perf props + `cachePolicy`

## Verification

- `npx tsc --noEmit` passes clean.
- `npx expo start --clear`, then on device:
  - Home → TopTabs strip shows "Couple Theme" + "Mood Based"; both open 2-col grids; mood chips swap the grid.
  - Settings → "Premium Themes" shows 9 gradient tiles; tapping moves the checkmark and persists.
  - Tap Popular/Newest/Category — grid appears instantly (no spinner pause).
  - Home header search box → `/search`; typing filters live; chips multi-select; bad query shows "No results".
  - Collection / Theme cards show badges and open a theme-pack screen; section "See all" links navigate.

## Notes

- Tasks 4 & 5 deferred (need `expo-video` install + native rebuild / a
  wallpaper native module) — see `DEVELOPMENT_BRIEF.md`.
- Premium themes: catalog + picker + persistence are live; making the tokens
  drive every screen needs a ThemeProvider context (follow-up).
- New route files (`search`, `wallpapers/couple-theme`, `wallpapers/mood-theme`)
  aren't in expo-router's typed-route union until Metro regenerates
  `.expo/types`; `/search` is pushed with an `as Href` cast meanwhile.
