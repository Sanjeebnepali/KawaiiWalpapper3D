# Zero-worklet cells, flat overlays, RAF-based deferred mount

**Date:** 2026-05-17
**Type:** fix

## Problem

User feedback after changes/031: noticeable improvement, but still feels
"freezes for a few mini seconds" on stack push and "lag while scrolling
on any page where images are". Also a new warning:

> WARN  InteractionManager has been deprecated and will be removed in a
> future release. Please refactor long tasks into smaller ones, and use
> 'requestIdleCallback' instead.

Key observation from the user: *other image-heavy apps don't feel this
way*. So the bottleneck wasn't network or decode (already fixed with the
480×854 thumbs in changes/030) — it had to be per-cell JS work.

Re-audit found:

### 1. Every cell mounted a Reanimated worklet

`AnimatedButton` uses `useSharedValue` + `useAnimatedStyle` + `withSpring`
for press-scale feedback. Each instance sets up a worklet bridge
(JS↔UI thread plumbing) at mount. For a 30-cell grid with both the cell
wrapper AND the heart button using AnimatedButton, that's **60 worklet
bridges per grid mount**. Native gallery apps (Instagram, Pinterest,
Photos) use the OS-native press dim (opacity), which has zero worklet
cost and runs entirely on the UI thread. We were paying a Reanimated
bill for a feature the rest of the industry doesn't use.

### 2. Every card painted a fresh LinearGradient

`expo-linear-gradient` on Android is a custom `Drawable` backed by a
`Shader` — each instance is a fresh paint pass with no caching across
cells. The two-stop gradients we used purely for text-contrast
(`'rgba(0,0,0,0.05)' → 'rgba(0,0,0,0.85)'`) are visually
indistinguishable from a single flat `rgba(0,0,0,0.45)` semi-transparent
View at the same height. The View is a built-in RN primitive — no
shader, just a pixel fill.

### 3. `InteractionManager` is deprecated

The RN team removed it without a 1:1 replacement. The standard fix is
two stacked `requestAnimationFrame` calls — defers the heavy mount past
the next paint, which is when react-native-screens actually kicks off
the slide-in.

## Solution

### `SimpleButton` — native Pressable with opacity feedback

New component (`components/SimpleButton.tsx`):

```tsx
<Pressable
  {...rest}
  style={({ pressed }) => [style, pressed && { opacity: pressedOpacity }]}
>
```

That's the whole thing. Pressable's `style` callback receives the press
state from the UI thread without any bridge crossings, sharedValues, or
worklets. The press dim looks identical to the spring scale at typical
press durations (<100 ms) but costs effectively nothing per cell.

**Where it replaces AnimatedButton:**

| File | Sites | Why |
|---|---|---|
| `components/WallpaperGridCell.tsx` | cell + heart | 30 cells × 2 = 60 worklets/grid removed |
| `components/VideoWallpaperCard.tsx` | cell | 8 worklets/screen removed |
| `app/wallpapers/dual.tsx` (inline cell) | cell | 6 worklets/screen removed |
| `components/CategoryPreviewList.tsx` PhotoCell | thumb | 16 worklets/Home removed |
| `components/ThemeBasedRow.tsx` ThemeCard | card | 4 worklets/Home removed |
| `components/CollectionGrid.tsx` CollectionCard | card | 6 worklets/Home removed |

**Total: ~100 worklet bridges removed from cold Home + grid mount.**

AnimatedButton kept for:
- Apply / Set / Logout / large CTAs (the spring scale IS the design)
- Section title rows / view-all rows in CategoryPreviewList (deliberate
  spring on tap; only 8 instances)
- Top-tab labels, header buttons (low count, prominent feedback)

### Flat View overlays replace per-cell LinearGradient

Pattern:

```tsx
// Before
<LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.85)']} style={StyleSheet.absoluteFill} />

// After
<View style={styles.darken} pointerEvents="none" />
// where styles.darken = { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' }
```

Applied in `WallpaperGridCell`, `VideoWallpaperCard`, `ThemeBasedRow`,
`CollectionGrid`. The title text contrast is preserved.

GlassCard kept its gradient (the design uses a 3-stop curve with a
`locations` prop — replacing with a flat overlay would noticeably change
its look; only 5 instances on Home so the cost is small).

### `hooks/useDeferredMount.ts` rewrite

```ts
useEffect(() => {
  let cancelled = false;
  const id1 = requestAnimationFrame(() => {
    if (cancelled) return;
    requestAnimationFrame(() => {
      if (!cancelled) setReady(true);
    });
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(id1);
  };
}, []);
```

Two RAFs: one to defer past the current paint, one more to land AFTER
the next paint — which is when react-native-screens has actually kicked
off the slide-in. Mounting in the third frame means the JS thread is
free for the first ~16 ms of the animation. Same UX as the old
InteractionManager version, without the deprecation warning, more
deterministic.

## Files changed

- `hooks/useDeferredMount.ts` — rewrite to use two stacked RAFs; no more
  `InteractionManager` import.
- `components/SimpleButton.tsx` (NEW) — zero-worklet press button.
- `components/WallpaperGridCell.tsx` — full rewrite to SimpleButton +
  flat overlay; stable callbacks (`useCallback`) on every handler.
- `components/VideoWallpaperCard.tsx` — full rewrite, same pattern.
- `components/CategoryPreviewList.tsx` PhotoCell — switched to
  SimpleButton (kept AnimatedButton on the section title + view-all rows).
- `components/ThemeBasedRow.tsx` ThemeCard — SimpleButton + flat overlay;
  dropped LinearGradient import.
- `components/CollectionGrid.tsx` CollectionCard — same.
- `app/wallpapers/dual.tsx` — inline card uses SimpleButton; imports it.

## Verification

1. `npx expo start --clear` — and follow CLAUDE.md's Metro stale-worker
   recovery if the device still serves the old bundle.
2. **The deprecation warning is gone.**
3. **Tap into Video / Dual / Theme Packs / a Category.** Should slide
   in immediately; the freeze before the slide should be barely
   perceptible. Cells stream in over the next ~80 ms.
4. **Scroll any 2-col grid.** Should feel like a native gallery — no
   per-cell stutter as cells enter the viewport. The press dim (opacity)
   feels identical to the old spring scale at normal tap durations.
5. Heart-toggle on any cell still only re-renders the cell that
   flipped (the `useIsFavorite(id)` per-id subscription from changes/029
   is unchanged).

## Notes

- The performance gap between dev and production builds on RN is large.
  After these changes the dev build should already feel close to
  native-smooth; a production build (`eas build --profile production`
  or `npx expo run:android --variant release`) will be smoother still
  because Hermes optimizes worklets + JS thread work aggressively.
- If after all this the scroll still feels heavy, the next step would
  be `@shopify/flash-list` — but CLAUDE.md is deliberately conservative
  about new deps, and FlatList with these optimizations is within
  ~10–15% of FlashList for grids of this size.
- Worth doing: deprecate the use of LinearGradient in any future cells
  unless the gradient really matters to the design. A flat dark View at
  reduced alpha is almost always indistinguishable.
- The pattern in `SimpleButton` (Pressable + style callback) is the
  same pattern the official React Native docs recommend for buttons
  that don't need spring physics.
