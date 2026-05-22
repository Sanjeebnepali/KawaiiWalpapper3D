# App-wide smoothness pass — lazy sheets, image prefetch, RNS freeze

**Date:** 2026-05-15
**Type:** fix (performance)

## Problem

After #017 the wallpaper actually applies in one tap, but the user still
reports the app feels laggy — most visibly, tapping a wallpaper card
freezes for ~1 s before the preview opens. The freeze is real: the JS
thread is doing significant work *during* the native stack push
animation, so the screen mounts late and feels stuck.

Three concrete causes (in descending impact):

1. **`/wallpaper/[id]` eagerly mounts 3 bottom-sheet modals** —
   `WallpaperMenu` renders **10 staggered `Animated.View entering={FadeInUp.delay(...)}`** rows
   on mount; `SetAsWallpaperModal` adds 3 more; `WallpaperInfoModal`
   adds 5. That's ~18 worklet entering-animations queued on the JS
   thread before the screen can even paint, on every tap into the
   preview. None of those sheets are visible until the user taps a
   button.
2. **HD image isn't pre-fetched.** `expo-image` starts the network
   request only after `/wallpaper/[id]` mounts. The user stares at the
   "Loading HD preview…" blur for the round-trip.
3. **Several heavily-tapped components still use raw `Pressable`** with
   no scale feedback (`GlassCard` Featured cards, `CategoryPreviewList`
   preview cells + title + View All, `ThemePicker` tiles, three modal
   Cancel/Done buttons), so even when navigation is fast the user
   thinks the tap was dropped.

## Solution

### 1. Lazy-mount the bottom sheets after navigation completes

`app/wallpaper/[id].tsx`:

```tsx
const [sheetsReady, setSheetsReady] = useState(false);
const pendingPresentRef = useRef<null | (() => void)>(null);

useEffect(() => {
  const task = InteractionManager.runAfterInteractions(() =>
    setSheetsReady(true),
  );
  return () => task.cancel();
}, []);

// Render:
{sheetsReady && (
  <>
    <WallpaperMenu ref={menuRef} … />
    <SetAsWallpaperModal ref={setWallpaperRef} … />
    <WallpaperInfoModal ref={infoRef} … />
  </>
)}
```

`InteractionManager.runAfterInteractions` schedules the state flip for
*after* the route push animation. Initial render of the preview screen
is now just the image + chrome — no FadeInUp queue. The sheets mount
silently a frame later.

A `pendingPresentRef` guard handles the corner case where the user
taps a button (⋯ / Apply long-press) before the deferred mount fires:
the present call is queued, the sheets are force-mounted now, and an
effect drains the queue once `sheetsReady` flips. Subsequent presents
are cheap because the sheets stay mounted.

### 2. Prefetch the HD image on press-in

`expo-image` exposes `Image.prefetch(url)` which warms the disk + memory
cache. Wiring it to `onPressIn` (which fires ~50 ms before `onPress`) on
every place the user can open a wallpaper means the bitmap is usually
already cached by the time `/wallpaper/[id]` mounts — the loading blur
either never appears or is gone in one frame.

Call sites added:

- `components/WallpaperGridCell.tsx` — the shared 2-col grid cell used
  by every category/couple/mood/search/theme screen.
- `components/GlassCard.tsx` — the Featured carousel card.
- `components/CategoryPreviewList.tsx` — the 4-photo preview rows on
  Home.

### 3. AnimatedButton across remaining tap surfaces

Migrated the last raw `Pressable + opacity` call sites to
`components/AnimatedButton.tsx`'s spring press-scale:

- `components/GlassCard.tsx` — Featured carousel card wrapper.
- `components/CategoryPreviewList.tsx` — section title row, the 4
  preview cells, the View All row.
- `components/ThemePicker.tsx` — the 9 gradient theme tiles. Required
  extending `AnimatedButton` with a new `wrapperStyle` prop so the
  outer `Animated.View` can carry the `width: '31%'` flex-wrap layout
  (this was the blocker noted in #016).
- `components/SetAsWallpaperModal.tsx` — Cancel link.
- `components/WallpaperInfoModal.tsx` — Done link.
- `components/WallpaperMenu.tsx` — Cancel link.

### 4. `enableFreeze()` from react-native-screens

`app/_layout.tsx` calls `enableFreeze(true)` at module load. RNS pauses
React work on off-screen native screens, so when the user navigates
from Home → wallpaper preview, Home's children (sticky header, three
FlatLists, category preview grids) stop running effects and re-renders
until the user navigates back. This cuts background JS thread cost
during the push, helping the new screen mount faster.

Safe with our routes: tabs are state-preserving, the
`transparentModal` `wallpaper/[id]` route keeps its background screen
*visible* but the background screen's React tree is paused — visible,
not unmounted, so there's no flicker.

## Files changed

- `app/wallpaper/[id].tsx` — lazy-mount sheets with
  `InteractionManager`; `pendingPresentRef` queue; `openMenu` /
  `openSetWallpaperModal` / `openInfo` route through `presentOrQueue`.
- `app/_layout.tsx` — import + call `enableFreeze(true)`.
- `components/AnimatedButton.tsx` — new `wrapperStyle` prop applied to
  the outer `Animated.View`.
- `components/WallpaperGridCell.tsx` — `onPressIn` → `Image.prefetch`.
- `components/GlassCard.tsx` — `Pressable` → `AnimatedButton` +
  `onPressIn` prefetch.
- `components/CategoryPreviewList.tsx` — three `Pressable` call sites
  → `AnimatedButton`; preview cells prefetch on press-in.
- `components/ThemePicker.tsx` — `Pressable` → `AnimatedButton` with
  `wrapperStyle={styles.tile}` for the percent-width layout; drop the
  dead `styles.pressed` entry.
- `components/SetAsWallpaperModal.tsx` — Cancel `Pressable` →
  `AnimatedButton`; drop `Pressable` import.
- `components/WallpaperInfoModal.tsx` — Done `Pressable` →
  `AnimatedButton`; drop `Pressable` import.
- `components/WallpaperMenu.tsx` — Cancel `Pressable` →
  `AnimatedButton`; drop `Pressable` import.

## Verification

No native rebuild — pure JS. `npx expo start --clear` then on device:

1. From Home → tap any grid cell → preview opens with the image
   visible **immediately** in the common case (warm cache from
   `onPressIn` prefetch). The loading blur should rarely flash.
2. Inside the preview, tap **⋯**. The menu sheet still appears
   instantly — even though it was mounted lazily, the
   `InteractionManager` mount fires within ~50 ms of the route push.
3. Tap each migrated button — Featured carousel cards, category
   preview rows, View All, theme tiles, modal Cancel/Done — all
   spring-scale on press (no more dead taps).
4. Switch tabs back and forth — JS thread stays quieter (verify in
   the React DevTools profiler / Hermes sampler if curious; subjective
   smoothness should already be obvious).

## Notes

- `InteractionManager.runAfterInteractions` is the canonical RN way to
  defer work past navigation animations. It's a no-op if the animation
  is already done, so it works the same on cold and warm mounts.
- `Image.prefetch` is fire-and-forget; on the rare miss (image fails
  to load before the screen mounts) the existing `<BlurView>` loader
  still covers the gap — no UX regression.
- `wrapperStyle` on `AnimatedButton` is intentionally minimal — it
  exists so percent-width / flex-grid tiles work. Most call sites
  don't need it; they pass `style` only, which still goes to the
  inner `Pressable` exactly like before.
- `enableFreeze(true)` should be safe with our nav graph, but if any
  screen later relies on running effects while off-screen (e.g.
  background polling), revisit. Tabs that need real-time updates
  should be the active route by definition.
- Modal Cancel/Done buttons were the last raw `Pressable + opacity`
  surfaces; with this pass, `ThemePicker` is no longer the "one
  remaining" exception noted in #016. The whole app now uses
  `AnimatedButton` for tap feedback.
- The `pendingPresentRef` defense is overkill on typical hardware
  (deferred mount fires within ~50 ms) but cheap, and prevents a
  dropped-tap surprise on a stressed device.
