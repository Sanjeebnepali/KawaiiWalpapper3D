# Deferred mount on pushed screens + instant thumbnails

**Date:** 2026-05-17
**Type:** fix

## Problem

After changes/030 the user reported the app felt better but still not
native-smooth: "while i click video walpapper and so on first 1 sec it
freez and then it open and when i scroll it feels lag".

Two distinct issues remained:

### 1. The 1-second freeze on push

When the user taps Video / Dual / Theme Packs / a Category, expo-router
calls `router.push(...)`. The destination screen's `render()` runs on the
JS thread BEFORE the native push animation can start. A grid with 6–30
cells (each with an `AnimatedButton` worklet + `<Image>` + `<LinearGradient>`
+ 2 Views) takes ~500–1000 ms of JS work. During that window:

- The tap appears unresponsive ("freeze").
- The push animation can't start because react-native-screens is waiting
  for the JS-side mount to complete before adding the native fragment.
- When it finally does animate, the slide-in stutters because the JS
  thread is still finishing layout passes.

This is *the* canonical "RN slow navigation" pain point. The standard fix
is `InteractionManager.runAfterInteractions` — defer the heavy part of
the screen until after the current interaction (the push animation)
finishes. The screen shell + back button render immediately, the push
animates smoothly, and the list pops in ~80 ms later. Feels native.

### 2. 6–30 concurrent image fade-ins on grid mount

Every grid `<Image>` had `transition={80}`. On grid mount, all visible
cells finish loading around the same time → multiple 80 ms opacity
animations queue on the UI thread → visible scroll stutter. Native
gallery apps (Photos, Pinterest, Instagram) snap thumbnails in instantly
with no fade; the fade was decorative jank.

## Solution

### `hooks/useDeferredMount.ts`

```ts
export function useDeferredMount(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);
  return ready;
}
```

Returns `false` on the first render, `true` after the current interaction
(push, gesture, tab transition) settles. Cancellable so a fast
unmount doesn't leak the task.

### Wired into 6 pushed-route screens

```tsx
const listReady = useDeferredMount();
...
return (
  <SafeAreaView>
    <Header />
    {listReady ? <FlatList ... /> : null}
  </SafeAreaView>
);
```

Applied to:

- `app/wallpapers/video.tsx`
- `app/wallpapers/dual.tsx`
- `app/wallpapers/theme-packs.tsx` (gates the whole ScrollView body —
  banner + 6 hero pack cards + user collections — since each piece is
  visually heavy)
- `app/category/[id].tsx`
- `app/theme-pack/[id].tsx`
- `app/mood/[id].tsx`

Each screen's `initialNumToRender` was dropped from 6/8 to 4 and
`maxToRenderPerBatch` from 6/8 to 2, so even after the gate releases,
cells stream in instead of all mounting in one frame.

### `transition={0}` on every grid/list image

- `components/WallpaperGridCell.tsx`
- `components/VideoWallpaperCard.tsx`
- `components/CategoryPreviewList.tsx` (also added `recyclingKey`)
- `components/ThemeBasedRow.tsx` (added `recyclingKey`)
- `components/CollectionGrid.tsx` (added `recyclingKey`)
- `components/GlassCard.tsx` (the Featured hero)
- `app/wallpapers/dual.tsx` (inline card image)
- `app/wallpapers/theme-packs.tsx` (3 places: active-banner backdrop,
  pack hero, user-collection thumb)

Bitmaps now snap in once decoded, like native gallery apps. Cells still
have `Colors.surface` as a placeholder so empty frames don't flash white.

### Did NOT defer tab screens

Tab switches don't have an animation to wait for (default tab transition
is instant). Adding `useDeferredMount` to `couple`/`mood`/`profile`/`ai`
would show a brief empty frame on every tab tap. The right tradeoff for
tabs is keeping `enableFreeze(true)` so the previous content is preserved
while inactive — already in place via `app/_layout.tsx`.

## Files changed

- `hooks/useDeferredMount.ts` (NEW)
- `app/wallpapers/video.tsx` — gate + render budget trim + transition=0.
- `app/wallpapers/dual.tsx` — gate + render budget trim + transition=0.
- `app/wallpapers/theme-packs.tsx` — gate (around ScrollView body) +
  3× transition=0.
- `app/category/[id].tsx` — gate (preserves the loading/error states) +
  render budget trim.
- `app/theme-pack/[id].tsx` — gate + render budget trim.
- `app/mood/[id].tsx` — gate + render budget trim.
- `components/WallpaperGridCell.tsx` — transition 80 → 0.
- `components/VideoWallpaperCard.tsx` — transition 80 → 0.
- `components/CategoryPreviewList.tsx` — transition 80 → 0, +recyclingKey.
- `components/ThemeBasedRow.tsx` — transition 80 → 0, +recyclingKey.
- `components/CollectionGrid.tsx` — transition 80 → 0, +recyclingKey.
- `components/GlassCard.tsx` — transition 80 → 0.

## Verification

1. `npx expo start --clear`.
2. On device:
   - **Tap Video Wallpapers from the TopTabs row.** Should slide in
     immediately (~250 ms native animation), then the 8 cards pop in
     over the next ~80 ms. No freeze before the slide starts.
   - **Tap a category icon from Home.** Same — instant slide, then
     cards stream in 2 at a time as the InteractionManager fires.
   - **Scroll any 2-col grid.** Should feel smooth — no fade-in pops as
     cells enter the viewport, bitmaps snap in once decoded.
   - **Tap Theme Packs.** Header paints instantly, body (Quick Start +
     My Collections) appears after the push completes.
3. The very first time you hit a screen the cache is cold and images
   take a beat to download — that's not lag, that's network latency. From
   the second visit they're instant.

## Notes

- This pattern is the difference between "RN feels janky" and "RN feels
  native" on push-heavy navigation. Worth adopting for any future
  screens with > ~4 image cards.
- For screens that are EXTREMELY heavy (e.g. a future infinite scroll
  with rich cells), the next step would be FlashList or a Suspense
  boundary with a skeleton. Not needed here.
- The deferred mount is for the push case. If a user comes back to the
  screen via the tab switcher or back-stack pop, the screen is already
  mounted (or thawed via `enableFreeze`) and renders instantly.
- `transition={0}` on the wallpaper preview is also already in place
  (changes/030) — the BlurView covers everything until onLoad fires.
