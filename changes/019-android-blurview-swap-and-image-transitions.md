# Android BlurView swap + image-transition tightening

**Date:** 2026-05-15
**Type:** fix (performance)

## Problem

After #018 (lazy sheets, image prefetch, freeze) the user still reports
the app "feels laggy" — any button or image tap freezes for ~1 s before
the next screen opens. The previous fixes addressed JS thread work; the
remaining gap is **GPU/UI-thread cost from stacked `BlurView`s on
Android**.

Inventory on the home tab alone:

- `components/PremiumIcon.tsx` × 4 (intensity 18)
- `components/GlassCard.tsx` × 5 in the Featured carousel (intensity 40)

= **9 simultaneous `BlurView`s**. Plus the wallpaper preview screen
ships two more (intensity 80 loading curtain + intensity 50 footer
glass).

On Android each `BlurView` is a real-time GPU blur. API 31+ uses
`RenderEffect.createBlurEffect` (faster than the old RenderScript
fallback) but it's still expensive per frame, and the cost stacks
linearly with instance count. With ≥9 active, frame pacing collapses on
anything below a flagship and even pricey phones drop frames during
navigation — exactly the "freeze for a second" the user describes.

iOS doesn't have this problem: `BlurView` there compiles to
`UIVisualEffectView`, a hardware-accelerated single-pass primitive.

## Solution

### 1. Platform-aware `Glass` component

New `components/Glass.tsx`:

```tsx
export function Glass({ intensity = 40, tint = 'dark', style, androidFill, children }: Props) {
  if (Platform.OS === 'android') {
    return (
      <View style={[{ backgroundColor: androidFill ?? 'rgba(20,20,20,0.62)' }, style]}>
        {children}
      </View>
    );
  }
  return <BlurView intensity={intensity} tint={tint} style={style}>{children}</BlurView>;
}
```

Plus a `GlassAbsoluteFill` convenience that adds `StyleSheet.absoluteFill`
to the style.

On Android, a translucent solid View visually approximates the dark
glass look against the app's `#131313` background closely enough at
typical sizes — and is essentially free to render. iOS keeps the real
blur where it costs nothing.

### 2. Swap all `BlurView` call sites

- `components/PremiumIcon.tsx` — the 4 category icons' inner blur
  (`StyleSheet.absoluteFill`).
- `components/GlassCard.tsx` — the title/meta panel on each Featured
  carousel card.
- `app/wallpaper/[id].tsx` — both the loading curtain (with a slightly
  more opaque `androidFill` so the spinner text reads) and the footer
  glass that holds Apply / heart / title.

Single seam: if Android's blur perf ever justifies the cost on a
specific surface, flip the branch in `Glass.tsx` only. No call site
changes.

### 3. Tighten `expo-image` transitions

The cards' default fade-in is what makes the cell feel "soft to land"
after the screen opens. With prefetched cache, the fade is just stalling
the perceived appearance.

- `components/GlassCard.tsx`: `transition={200}` → `80` + add
  `cachePolicy="memory-disk"`.
- `components/WallpaperGridCell.tsx`: `transition={150}` → `80`.
- `components/CategoryPreviewList.tsx`: `transition={150}` → `80`.

`wallpaper/[id]` was already at `120` (from #017); leaving it.

## Files changed

- `components/Glass.tsx` — new (Platform-aware Glass + GlassAbsoluteFill).
- `components/PremiumIcon.tsx` — drop `BlurView` import; use
  `GlassAbsoluteFill`.
- `components/GlassCard.tsx` — drop `BlurView` import; use `Glass` for
  the title panel; bump `cachePolicy`; shorter transition.
- `app/wallpaper/[id].tsx` — drop `BlurView` import; use
  `GlassAbsoluteFill` for the loading curtain and `Glass` for the
  footer.
- `components/WallpaperGridCell.tsx` — shorter `transition`.
- `components/CategoryPreviewList.tsx` — shorter `transition`.

## Verification

No native rebuild — pure JS.

```
npx expo start --clear
```

Then on Android:

1. Open home tab — should scroll noticeably smoother. Category icons +
   featured cards still look "frosted" against the dark bg (translucent
   View approximation).
2. Tap any grid cell. The wallpaper preview should open in 1–2 frames;
   the loading curtain (if it appears at all — usually the prefetch
   beats it) reads correctly with the solid translucent fill.
3. Tap **Apply** / **⋯** — same instant feel.

On iOS the visual is identical to before — `Glass` falls through to
`BlurView`.

## Notes

- The Android side intentionally drops *true* blur. The visual
  difference is most noticeable on Featured cards where the
  title panel sits over an image — there the solid translucent View
  is slightly less "frosted" but still legible against the gradient
  darkening underneath. Acceptable trade for the frame-rate win.
- If the user reports any specific surface looking flat on Android,
  override `androidFill` for that one call (e.g. a thicker gradient).
  The `Glass` API supports it without touching the swap logic.
- **Dev mode caveat**: React Native in dev mode (Metro running,
  Hermes debug + JS sourcemaps) is 3-5× slower than a release build.
  If the freeze persists after this change, build a release APK
  (`npx expo run:android --variant release`) and re-test on the same
  device. A lot of "lag" in dev disappears entirely in release.
- The 1 s freeze was a stacked effect of three layers, each addressed
  in a separate change:
  - #017: per-tap UX (AnimatedButton feedback, dropped setTimeout chains)
  - #018: per-screen JS work (lazy bottom sheets, image prefetch, RNS freeze)
  - #019: per-frame GPU cost on Android (BlurView swap, transition trim)
  This change is the GPU-side piece. The three together should get
  the user from "1 s freeze" to "instant" on midrange Android.
