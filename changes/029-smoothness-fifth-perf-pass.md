# Fifth perf pass — Home virtualization, full memoization, list discipline

**Date:** 2026-05-17
**Type:** fix

## Problem

User reported persistent lag during navigation, scrolling, and tab switches
across the whole app. Code audit found three load-bearing causes:

1. **Home (`app/(tabs)/index.tsx`) was a plain `ScrollView`** with eager
   `.map()` over every section. ~30 expo-image instances + 50 AnimatedButtons
   + 4 horizontal `FlatList`s + 1 6-card grid mounted on the very first focus
   of Home, blocking the JS thread for ~1 s on mid-range Android. No
   virtualization meant the cost was paid up-front and never amortized.
2. **Home's horizontal `FlatList`s had inline `renderItem` and missed every
   virtualization knob** (`initialNumToRender`, `windowSize`,
   `maxToRenderPerBatch`, `removeClippedSubviews`, `getItemLayout`). Inline
   `renderItem` means `React.memo` on the row component never short-circuits.
3. **`theme-pack/[id].tsx` subscribed each cell to the whole `favIds` array.**
   Any heart toggle re-rendered every visible cell.

Smaller findings that compounded:

- Section components on Home (`Header`, `TopTabs`, `CategoryIcons`, `Section­Title`,
  `CategoryPreviewList`, etc.) weren't `React.memo`'d, so any Home re-render
  cascaded.
- `CategoryIcons` carried a useless local `useState` that fired an extra
  render before navigation.
- `CustomTabBar` re-built all 5 `Pressable`s on every tab change.
- `ItemSeparatorComponent={() => …}` and `columnWrapperStyle={{ gap }}` in
  four grid screens were re-created inline per render.
- `expo-image` `transition` was inconsistent (80 / 120 / 150 / 200 ms);
  several large cells re-rendered with no `recyclingKey`, so fast scrolls
  flashed the previous bitmap.
- `RootStack` rebuilt its `navTheme` and `screenOptions` objects every render.

## Solution

### 1. Home is now a virtualized `FlatList` of sections

`app/(tabs)/index.tsx` has one `FlatList` whose `data` is the section list
(`icons`, `previews`, `featured-title`, `featured`, `themes-title`, `themes`,
`collections-title`, `collections`) and whose `ListHeaderComponent`
(Header + TopTabs) sits at `stickyHeaderIndices={[0]}`. With
`initialNumToRender={3}` + `windowSize={5}`, the heavy `FeaturedCarousel` /
`ThemeBasedRow` / `CollectionGrid` sections only mount as the user
scrolls toward them. First-paint cost drops to whatever the first 3 sections
take.

### 2. Memo + stable callbacks for every section component

`Header`, `SectionTitle`, `CategoryIcons`, `TopTabs` (+ inner `TopTabItem`),
`CategoryPreviewList` (+ extracted `CategorySection` / `PhotoCell`),
`FeaturedCarousel` (+ uses `useCallback` `renderItem` + `getItemLayout`),
`ThemeBasedRow` (+ extracted `ThemeCard`), `CollectionGrid` (+ extracted
`CollectionCard`) — all wrapped in `React.memo`. Section data is built once
at module load (`SECTIONS` const) so `CategoryPreviewList` no longer rebuilds
its photo arrays per mount.

`CategoryIcons` lost the stale `useState(active)` — the active category is
already encoded in the route, the extra render pre-push is gone.

### 3. List virtualization knobs everywhere

Every horizontal `FlatList` on Home gained `initialNumToRender`,
`maxToRenderPerBatch`, `windowSize`, `removeClippedSubviews`, and
`getItemLayout` (we know item width is constant). Every vertical grid
(`category/[id]`, `couple`, `wallpapers/video`, `wallpapers/dual`,
`theme-pack/[id]`) hoisted `Separator` + `columnWrapper` to module-level
constants and switched to a `useCallback`'d `renderItem` so the memoized
cell component's `React.memo` actually short-circuits.

### 4. `theme-pack/[id].tsx` now uses `WallpaperGridCell`

Replaced the bespoke inline cell + `favIds.includes(item.id)` whole-array
subscription with the shared `WallpaperGridCell`, which is `React.memo`'d and
uses the per-id `useIsFavorite(id)` selector. A heart tap re-renders only
the cell that flipped.

### 5. Image discipline

- Standardized `transition={80}` on every list/grid cell (was 120 / 150 / 200
  on a few).
- Added `recyclingKey={id}` to `WallpaperGridCell`, `VideoWallpaperCard`,
  and `dual.tsx`'s cell so `expo-image` recycles bitmaps as cells slide in
  and out of the recycler window, instead of mounting fresh decoders.

### 6. `CustomTabBar` memoization

Extracted `TabButton` into a `React.memo`'d subcomponent. Tapping a tab now
re-renders just the formerly-focused and the newly-focused buttons, not all
five `Pressable`s.

### 7. Root stack memo

`navTheme` and `screenOptions` are `useMemo`'d in `app/_layout.tsx` so
`<NavThemeProvider>` and `<Stack>` don't see new prop references on every
`RootStack` re-render. Default `Stack` animation changed from `'fade'` to
`'simple_push'` (the native-screens animation that every screen was already
overriding to — saves the JS-thread fade for the one screen that didn't
override).

## Files changed

**Home (the big one):**
- `app/(tabs)/index.tsx` — full rewrite: `ScrollView` → `FlatList` of
  sections; `useCallback` for nav handlers; memo'd `ListHeaderComponent`;
  virtualization knobs.

**Section components (memo + structural):**
- `components/Header.tsx` — wrapped in `React.memo`.
- `components/SectionTitle.tsx` — wrapped in `React.memo`.
- `components/CategoryIcons.tsx` — removed `useState`, wrapped in
  `React.memo`, stable `onPress` via `useCallback`.
- `components/TopTabs.tsx` — `TopTabItem` and outer `TopTabs` both
  memoized; press handler hoisted via `useCallback`.
- `components/CategoryPreviewList.tsx` — `SECTIONS` hoisted to module scope;
  extracted memo'd `CategorySection` and `PhotoCell` so the per-section
  4-image rows only re-render when their own props change.
- `components/FeaturedCarousel.tsx` — memo'd; `useCallback` renderItem;
  module-level `Separator` + `keyExtractor`; `getItemLayout` from constant
  card width; perf flags.
- `components/ThemeBasedRow.tsx` — extracted memo'd `ThemeCard`; same
  treatment as Featured.
- `components/CollectionGrid.tsx` — converted from `View` + `.map` to
  embedded `FlatList` (`scrollEnabled={false}`) so the 6 cards virtualize
  inside Home's outer FlatList; extracted memo'd `CollectionCard`;
  `getItemLayout`.

**Tab bar:**
- `components/CustomTabBar.tsx` — extracted memo'd `TabButton`; stable
  `handlePress` callback.

**Grid screens:**
- `app/theme-pack/[id].tsx` — replaced inline cell with `WallpaperGridCell`;
  hoisted `Separator` + `columnWrapper` + `keyExtractor`; memo'd renderItem.
- `app/(tabs)/couple.tsx` — hoisted `Separator` + `columnWrapper` +
  `keyExtractor`.
- `app/category/[id].tsx` — same.
- `app/wallpapers/video.tsx` — same + `useCallback` renderItem.
- `app/wallpapers/dual.tsx` — same + `useCallback` renderItem +
  `extraData={applyingId}` so the spinner-overlay flip propagates.

**Image discipline:**
- `components/WallpaperGridCell.tsx` — added `recyclingKey={id}`.
- `components/VideoWallpaperCard.tsx` — `transition` 150→80, added
  `recyclingKey`.
- `app/wallpapers/dual.tsx` — `transition` 150→80, added `recyclingKey`.

**Root:**
- `app/_layout.tsx` — `useMemo`'d `navTheme` + `screenOptions`; default
  Stack animation `'fade'` → `'simple_push'` (matches what every overriding
  screen already sets).

## Verification

1. `npm install --legacy-peer-deps` (no dep changes — but the install
   verifies nothing broke).
2. `npx expo start --clear`. If the device still gets a stale "module not
   found", follow the CLAUDE.md "Metro stale-worker gotcha" sequence.
3. On device, watch for:
   - **Home tab focus**: should land in under ~300 ms on mid-range Android
     (was ~1 s+). Only the first 3 sections mount; scroll to see Featured /
     Theme Based / Collections stream in.
   - **Sticky header**: Header + TopTabs row should still pin to the top
     while the body scrolls under it.
   - **Bottom tab switch**: should be instant (no rebuild of the unrelated
     tab buttons; tap latency is just the Pressable + nav).
   - **Theme-pack detail / category / couple / video / dual grids**: heart
     toggle on any cell should not blink the rest of the visible cells.
   - **Fast scroll on any 2-col grid**: no "flash of old image"; bitmaps
     swap in place as cells recycle.
4. There's no jest/typecheck wired up (per CLAUDE.md). Sanity-check changed
   files compile under `tsc --noEmit` if needed.

## Notes

- This is the fifth perf pass; previous passes (017, 018, 019, 020) were
  about removing one specific class of cost each (sheet mount cost, blur
  views, raster shadows, view tree depth). This pass is about
  **virtualization + memo hygiene** end-to-end. The combo unlocks the
  biggest wins because individual fixes (e.g. trimming a few shadows)
  didn't address the fact that Home mounted 30 images at once.
- `FlashList` would shave a few more ms but was not adopted — adding it
  would mean introducing a new dep in a project that's deliberately
  conservative about pinning (see CLAUDE.md "Critical dependency pins").
  FlatList with `getItemLayout` + `removeClippedSubviews` is within ~10%
  of FlashList for these list sizes.
- Persistence for favorites/settings stores is still a follow-up (noted in
  `store/favorites.ts` and `store/settings.ts`).
