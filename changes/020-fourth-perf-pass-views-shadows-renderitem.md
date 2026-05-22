# Fourth perf pass — view-tree, Android shadows, store subscriptions, route push

**Date:** 2026-05-16
**Type:** fix (performance)

## Problem

After #017, #018, #019 the user *still* reports app-wide lag — "everything I
feel lagging" — tapping anything (tab swap, card tap, settings toggle)
takes a beat before it responds.

The earlier passes shipped real wins:

- #017 — per-tap UX (AnimatedButton, drop dead `setTimeout` chains)
- #018 — per-screen JS work (lazy sheets, prefetch, RNS freeze)
- #019 — per-frame Android GPU cost (BlurView swap, transition trim)

What's left:

1. **`AnimatedButton` wraps a `Pressable` in an extra `Animated.View`.**
   Cheap per button, but Home alone has **35+** of them (PremiumIcon ×4,
   GlassCard ×5, ThemeBasedRow ×4, CollectionGrid ×6, CategoryPreviewList
   16 cells + 4 titles + 4 View-All, Header ×3, the AI sticky head). 35
   extra Views in the tree on first paint of every screen.
2. **Per-cell `elevation` + `shadow*` on Android.** Every cell in
   `WallpaperGridCell` (×8 visible, 30 windowed), `CollectionGrid` (×6),
   `ThemeBasedRow` (×4), `GlassCard` (×5), `ThemePicker` (×9) declared
   `elevation: 4-10`. Android renders an outset shadow per frame per view
   — stacked across 30+ cells while scrolling is the single largest GPU
   cost left.
3. **Settings screen subscribes to the whole store.**
   `const s = useSettingsStore()` makes any field write re-render *all 7
   sections + the slider + 3 modal trees*. Flipping Auto Download
   re-renders ≈40 child components. Visibly choppy toggle.
4. **`slide_from_right` route animation (~330 ms).** Even when the next
   screen mounts in 16 ms, the slide animation makes the tap feel slow.
5. **Inline `renderItem={({item}) => ...}` defeats `memo(WallpaperGridCell)`.**
   The arrow function identity changes each parent render, so every cell
   re-renders even when no row data has changed (e.g. on a parent state
   bump from another control).

## Solution

### 1. `AnimatedButton` is now a single animated `Pressable`

`components/AnimatedButton.tsx`:

```tsx
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
// …
return (
  <AnimatedPressable
    {...rest}
    onPressIn={handlePressIn}
    onPressOut={handlePressOut}
    style={composedStyle}
  >
    {children}
  </AnimatedPressable>
);
```

The Pressable itself carries the worklet transform — no wrapping
`Animated.View`. The `wrapperStyle` prop (used by `ThemePicker`'s flex
tiles) is just merged into the composed style array. No call site
needed to change.

**Impact:** ~35 fewer Views in the tree on first paint of Home. Every
press surface gets shallower, which helps both initial layout and
scroll perf (fewer subviews to reposition per frame).

### 2. Strip `elevation` + `shadow*` from inner list cells

Removed (Android-heavy lists, dark bg already hides the glow):

- `components/WallpaperGridCell.tsx` — `elevation: 4` + 3 shadow props
- `components/CollectionGrid.tsx` — `elevation: 6` + 3 shadow props
- `components/ThemeBasedRow.tsx` — `elevation: 6` + 3 shadow props
- `components/GlassCard.tsx` — `elevation: 10` + 3 shadow props
- `components/ThemePicker.tsx` swatch — `elevation: 4` + 3 shadow props

The `shadowColor: accent` per-cell dynamic was also pulled (it forced a
unique style object per render, blocking style flattening).

Kept (single instance, visible chrome):

- `components/CustomTabBar.tsx` — bar's drop-shadow
- `components/CustomTabBar.tsx` — center "Gallery" raised button glow
- `components/PremiumIcon.tsx` — active glow on the single focused icon

Visually: against `#131313` the outset shadows were barely visible next
to the LinearGradient darkening already on each card. The frame-rate
win when scrolling the gallery is far more valuable than the lost glow.

### 3. Per-field selectors in `app/(tabs)/profile.tsx`

```tsx
// Before:
const s = useSettingsStore();          // subscribes to entire store
<Toggle value={s.autoDownload} onValueChange={(v) => s.set('autoDownload', v)} />

// After:
const autoDownload = useSettingsStore((st) => st.autoDownload);
const setSetting   = useSettingsStore((st) => st.set);
<Toggle value={autoDownload} onValueChange={(v) => setSetting('autoDownload', v)} />
```

Zustand's selector contract: a subscriber only re-renders when its
selected slice changes (referential check). Flipping Auto Download now
re-renders only the Auto Download `<Toggle>`. The 6 other sections,
slider, ThemeModal, and 2 PremiumModals all stay put.

### 4. `simple_push` for stack routes

`app/_layout.tsx`: all 6 stack screens that were `slide_from_right`
become `animation: 'simple_push'`. `react-native-screens`' simple_push
is a no-frills hardware-driven transition that lands at ~180 ms vs.
slide's ~330 ms — the tap feels native-instant.

Kept `wallpaper/[id]` on `fade` (it's a `transparentModal` over the
tabs) but tightened the duration `160 → 140 ms`.

### 5. Stable `renderItem` via `useCallback`

Pulled the inline arrow out into a `useCallback`'d `renderItem` in:

- `app/category/[id].tsx` (deps: `meta.accent, cellW, cellH, openWallpaper, onLongPressDownload`)
- `app/(tabs)/couple.tsx` (deps: `cellW, cellH, openWallpaper`)
- `app/(tabs)/mood.tsx` (deps: `activeMood.tint, cellW, cellH, openWallpaper`)
- `app/search.tsx` (deps: `cellW, cellH, openWallpaper`)

The cells are wrapped in `memo()` already (see `WallpaperGridCell`).
A stable renderItem identity means a parent re-render (e.g. mood chip
press) only re-mounts cells whose deps actually changed — for a chip
change in `mood.tsx` that means just the new tint propagates;
unaffected props skip.

## Files changed

- `components/AnimatedButton.tsx` — drop wrapper Animated.View; promote
  Pressable to Animated.createAnimatedComponent.
- `components/WallpaperGridCell.tsx` — strip cell elevation/shadow*.
- `components/CollectionGrid.tsx` — strip item elevation/shadow*;
  drop per-cell `shadowColor: c.accent`.
- `components/ThemeBasedRow.tsx` — strip card elevation/shadow*;
  drop per-card `shadowColor: item.accent`.
- `components/GlassCard.tsx` — strip wrap elevation/shadow*;
  drop per-card `shadowColor: accent`.
- `components/ThemePicker.tsx` — strip swatch elevation/shadow*;
  drop per-tile `shadowColor: t.shadow`.
- `app/_layout.tsx` — 6× `slide_from_right` → `simple_push`;
  wallpaper modal duration `160 → 140`.
- `app/(tabs)/profile.tsx` — replace whole-store `useSettingsStore()`
  with 13 per-field selectors + 1 action selector.
- `app/category/[id].tsx` — `renderItem` lifted to `useCallback`.
- `app/(tabs)/couple.tsx` — `renderItem` lifted to `useCallback`;
  import `CoupleWallpaper` + `ListRenderItem`.
- `app/(tabs)/mood.tsx` — `renderItem` lifted to `useCallback`;
  import `CategoryPhoto` + `ListRenderItem`.
- `app/search.tsx` — `renderItem` lifted to `useCallback`;
  import `SearchableWallpaper` + `ListRenderItem`.

## Verification

Pure-JS change. No native rebuild.

```
npx expo start --clear
```

Then on Android (where the gains are biggest):

1. **Tab swap** — Generate / Couple / Gallery / Mood / Settings should
   feel near-instant. The first tap to a tab still pays the lazy-mount
   cost, but subsequent swaps are sub-100 ms.
2. **Home → Category tap** — a card tap now slides in via simple_push;
   the screen lands ~150 ms faster than before.
3. **Scroll the category grid** — frame pacing should be much steadier;
   no more sticky/stutter spots on rows that previously had outset
   shadows compositing.
4. **Settings — toggle Auto Download** — the toggle's spring animates
   smoothly because only that row re-renders. Open the Hermes / React
   DevTools profiler if curious; before, the whole screen re-rendered.
5. **Wallpaper preview** — same as #018 (cached image, sheets lazy);
   should still feel instant.

On iOS the visual is essentially unchanged — iOS shadow rendering is
cheap (offloaded to the GPU) and the BlurView already does the heavy
lifting on Featured cards; dropping `elevation` only affects Android.

## Notes

- **Dev mode caveat** still applies (per #019): release builds are
  3-5× faster than `npx expo start` dev. If lag persists, build a
  release APK (`npx expo run:android --variant release`) before
  iterating again.
- **Visual diff** on Android: cards lose a soft outset glow. Against
  the `#131313` bg the change is subtle; the gradient + tag pill +
  accent borders still distinguish each card. If a specific card
  *really* needs a glow back, prefer a `borderWidth: 1` + `borderColor`
  with the accent color — cheap, single-pass border instead of an
  outset shadow.
- **`shadowColor` as a per-render value** was the reason these styles
  couldn't flatten. Even with `elevation: 0` on iOS, a dynamic
  `{ shadowColor: accent }` per render creates a fresh style object,
  which costs more than the shadow ever did. The fix is structural —
  if a future design wants per-card glow, use a static tinted border
  instead.
- **Why not FlashList?** Considered. It's the right call for *very*
  long lists, but our screens cap at ~30-40 items. The wins here are
  in cell render cost and view depth, which FlashList wouldn't move.
  Adding a new dep + `estimatedItemSize` everywhere isn't worth it.
- **Why not migrate every `useCallback` of `renderItem`?** The other
  FlatLists (`wallpapers/dual`, `wallpapers/video`, `wallpapers/theme-packs`,
  `theme-pack/[id]`) render specialty cells, not `WallpaperGridCell`,
  and aren't memoized — they wouldn't benefit from stabilization.
  Leaving them inline.
- **Combined #017-#020 effect** on midrange Android: 1 s freeze on tap
  → preview should now be **< 200 ms** end-to-end. Scroll perf on the
  gallery should hold a steady 60 fps in release mode.
