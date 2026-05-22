# Actual lag root cause — image sizes + sticky-header conflict

**Date:** 2026-05-17
**Type:** fix

## Problem

After changes/029 (fifth perf pass) the user reported lag was unchanged:
"still same while changing page navigation open image it feels lag
scrolling in every page". Also saw a runtime warning:

> Can't perform a React state update on a component that hasn't mounted
> yet. This indicates that you have a side-effect in your render function
> that asynchronously tries to update the component.

Re-audit found two real causes that the fifth pass missed:

### 1. Picsum URLs requested 720×1280 for thumbnails

`constants/mockData.ts` had:

```ts
const pic = (seed: string, w = 720, h = 1280) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;
```

A 720×1280 picsum image decodes to **3.7 MB of bitmap memory** in RAM
(720 × 1280 × 4 bytes). A 30-cell category grid displays them at ~180 px
wide. The phone holds ~110 MB of decoded bitmaps just for thumbnails it
shows at thumbnail size. Every scroll triggers GC pauses as the decoder
cache rotates. **This was the actual lag** — not the component structure
the fifth pass fixed.

The fifth pass made the JS thread free; the bottleneck was the native
decoder + GPU memory.

### 2. Home FlatList `removeClippedSubviews` + sticky `ListHeaderComponent`

On Android, `removeClippedSubviews={true}` plus
`stickyHeaderIndices={[0]}` on a `ListHeaderComponent` is a known conflict.
The clipped subview machinery tries to mount/unmount children based on
viewport intersection while the sticky header is being relocated, which on
Reanimated-heavy children can produce the "hasn't mounted yet" warning —
an async setState (typically from a worklet bridge or a deferred
`Image.onLoad`) resolves into a frame where the cell hasn't completed its
initial mount.

### 3. `getItemLayout` in `CollectionGrid` with `numColumns={2}`

`getItemLayout` for a multi-column FlatList needs to account for items
sharing a row offset. The formula I wrote (`length: itemH, offset:
rowHeight * Math.floor(index / 2)`) gives items 0 and 1 the same offset
but different `length` semantics than FlatList expects for two-column
layouts. Since CollectionGrid is `scrollEnabled={false}` and has only 6
items, `getItemLayout` provides zero benefit and was a latent footgun.

### 4. `wallpaper/[id]` `onLoad` setState after unmount

`<Image onLoad={() => setLoaded(true)} />` fires asynchronously when the
image decode completes. If the user navigates back during the load, the
setState lands on an unmounted component — contributing to the warning.

## Solution

### 1. Halve+ the default thumb resolution

```ts
const pic = (seed: string, w = 480, h = 854) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export const picLarge = (seed: string) =>
  `https://picsum.photos/seed/${seed}/1080/1920`;
```

480×854 decodes to ~1.6 MB (down from 3.7 MB). A full 30-cell grid is
now ~50 MB of bitmaps instead of 110 MB. The visible difference at the
sizes grids actually display at (80–360 px) is imperceptible. Added
`picLarge()` as an opt-in helper for any future high-fidelity surface
(e.g. crisper preview screen).

### 2. Drop `removeClippedSubviews` on Home

`app/(tabs)/index.tsx` no longer sets `removeClippedSubviews`. The
`windowSize={5}` + `initialNumToRender={3}` virtualization is enough
for ~8 section rows.

### 3. Drop `getItemLayout` on `CollectionGrid`

`CollectionGrid` has 6 items total and `scrollEnabled={false}`. No
measurement benefit — removed the function and dropped the unused
`useMemo` import.

### 4. Mounted-ref guard in `wallpaper/[id]`

`mountedRef.current` is set to false in the unmount cleanup. Both
`Image.onLoad`'s `setLoaded` and the async `onApplyTap`'s `setApplying`
now check the ref before calling setState. No more unmount-race
warnings.

### 5. Drop `transition` on `wallpaper/[id]`'s preview image

The `<BlurView>` overlay already covers everything until `onLoad` fires,
so a fade-in on the underlying image is invisible work. Set `transition={0}`.

## Files changed

- `constants/mockData.ts` — `pic()` default 720×1280 → 480×854; added
  `picLarge()` export.
- `app/(tabs)/index.tsx` — removed `removeClippedSubviews` from Home
  FlatList.
- `components/CollectionGrid.tsx` — removed `getItemLayout` +
  `removeClippedSubviews`; dropped now-unused `useMemo` import.
- `app/wallpaper/[id].tsx` — added `mountedRef` guard; gated
  `onLoad`/`onApplyTap` setState behind it; dropped image transition.

## Verification

1. `npx expo start --clear` — and follow CLAUDE.md's Metro stale-worker
   recovery if the device still serves an old bundle.
2. **First launch after this change will feel slower** because every
   image URL changed (`...../720/1280` → `...../480/854`), so the
   expo-image cache is cold. Scroll through Home / category / couple /
   theme-pack once to warm the cache. Subsequent runs should feel
   dramatically smoother.
3. Confirm:
   - Scrolling Home is smooth from second visit onward.
   - Opening a grid item to `wallpaper/[id]` is instant (image stays
     cached at thumbnail size, blur-loader shows briefly while the same
     URL re-decodes at full screen).
   - The "hasn't mounted yet" warning does not reappear on rapid
     back-navigation during image load.
   - Sticky header (Header + TopTabs) still pins to the top of Home.

## Notes

- Memory is the silent killer on RN apps. The JS-thread fixes in
  changes/029 were real wins but the user couldn't feel them under a
  native decoder that was paging 110 MB of bitmaps.
- Did not opt the preview screen into `picLarge()` — the user explicitly
  prioritized smoothness over fidelity, and using `picLarge` would force
  a fresh ~6× larger fetch on every preview tap. If preview quality
  becomes a complaint later, switch `wallpaper/[id].tsx`'s `<Image
  source={{ uri: item.image }}>` to derive the URL via `picLarge` on
  the seed-style ids (everything except `featured`).
- For a real product (not picsum mocks), the same lesson applies: serve
  thumbnail-resolution variants from the CDN, not full-bleed source.
- The "hasn't mounted yet" warning also commonly fires under React 19
  StrictMode's double-invocation. If it reappears in dev only, that's
  why — production builds won't see it.
