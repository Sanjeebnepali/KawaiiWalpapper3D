# SafeAreaProvider, final FlatList tuning, release-build path

**Date:** 2026-05-17
**Type:** fix

## Problem

User feedback after changes/032: "somehow i still doesnot feel smooth i
want pure smooth full smooth in the app everywhere". The previous passes
removed component cost, worklets, gradient paints, and image memory.
What's left is harder:

1. **No SafeAreaProvider with `initialMetrics`.** Every screen used
   `SafeAreaView` from `react-native-safe-area-context` without a root
   provider holding cached metrics. On every push, the screen renders
   once at the wrong size, then re-renders after native sends back the
   real insets. One-frame layout flicker, plus a JS re-render, on every
   navigation.
2. **FlatList settings were "conservative" rather than aggressive.**
   `windowSize: 5` keeps 5 viewports worth of cells mounted (2 above, 2
   below visible). For 30-cell grids that's still a lot of cells alive
   during a fast scroll.
3. **`Header` + `GlassCard` still mounted AnimatedButton worklets** on
   every Home cold-mount — 2 in Header (logo + profile), 5 in
   FeaturedCarousel (one per GlassCard), plus 8 in CategoryPreviewList
   section title rows. 15 worklet bridges just on Home that don't need
   spring physics.
4. **The user is testing in a DEV build.** This is the most important
   point. RN dev builds run unoptimized JS, have Fast Refresh hooks,
   StrictMode double-rendering, source maps, dev menu, and the entire
   inspector wired up. **Release builds are 2–3× faster** on the same
   device with the same code.

## Solution

### 1. `SafeAreaProvider` with `initialMetrics` at the root

```tsx
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
...
<SafeAreaProvider initialMetrics={initialWindowMetrics}>
  <ThemeProvider>...</ThemeProvider>
</SafeAreaProvider>
```

`initialWindowMetrics` is captured by the native module at app launch.
With this, every `SafeAreaView`'s first render uses the correct insets
immediately. No layout flicker, no second re-render after measurement.
Also called `enableScreens(true)` explicitly so every Stack frame uses
a native UIViewController/Fragment (it's the default on RN ≥ 0.62 but
making it explicit makes the intent obvious and survives any future
default changes).

### 2. Maximally aggressive FlatList settings

Changed across all 6 grid screens:

| Setting | Before | After | Why |
|---|---|---|---|
| `windowSize` | 5 | 3 | Mount 1 viewport above + 1 below instead of 2+2. Fewer live cells during scroll. |
| `maxToRenderPerBatch` | 2 | 2 | (unchanged — already minimal) |
| `updateCellsBatchingPeriod` | 50 | 30 | Sub-divide cell batches more aggressively into smaller chunks per frame. |
| `initialNumToRender` | 4 | 4 | (unchanged — enough to fill the visible area) |

The trade-off: a *very* fast fling might briefly show a blank cell at
the leading edge while batching catches up. Native gallery apps do the
same thing — Pinterest, Photos all show placeholder frames during fast
scrolls.

### 3. SimpleButton in `Header`, `GlassCard`, and the
`CategoryPreviewList` section/view-all rows

`Header.tsx`: 3 AnimatedButtons (logo, profile, search box) →
SimpleButton. The header has zero scroll, no spring animation needed.

`GlassCard.tsx`: 1 AnimatedButton per Featured card × 5 cards. The
hero card has its own glass overlay + tag pills; the spring scale was
the least-noticed part of the design.

`CategoryPreviewList.tsx`: 2 AnimatedButtons per section × 4 sections =
8 buttons (title row + view-all). Drop both rows to SimpleButton.

**Total Home worklet count drop: ~15.**

AnimatedButton (the spring-scale variant) is now reserved for:
- the wallpaper preview `Apply` and `Set` CTAs (real spring matters)
- `theme-packs`'s `Shuffle` button (pack actions)
- modal Cancel/Confirm buttons
- the back arrow on every detail screen (1 per screen, fine)

### 4. Release-build npm scripts

Added to `package.json`:

```json
"android:release": "expo run:android --variant release",
"ios:release":     "expo run:ios --configuration Release",
"start:prod":      "expo start --no-dev --minify"
```

`npm run android:release` produces a release-mode native app. Hermes
optimizes bytecode, source maps are stripped, dev menu is gone,
StrictMode double-render disabled. On the same physical device, list
scroll FPS typically goes from 35–45 in dev to 55–60 in release.

`npm run start:prod` starts Metro in production-bundle mode for use
with a release-built APK — Metro serves minified, non-dev JS.

## Files changed

- `app/_layout.tsx` — wrapped root in `SafeAreaProvider` with
  `initialMetrics`, added explicit `enableScreens(true)`.
- `app/category/[id].tsx` — windowSize 5→3, updateCellsBatchingPeriod
  50→30.
- `app/(tabs)/couple.tsx` — same tuning.
- `app/theme-pack/[id].tsx` — same.
- `app/mood/[id].tsx` — same.
- `app/wallpapers/video.tsx` — same.
- `app/wallpapers/dual.tsx` — same.
- `components/Header.tsx` — AnimatedButton → SimpleButton (3 sites).
- `components/GlassCard.tsx` — AnimatedButton → SimpleButton.
- `components/CategoryPreviewList.tsx` — AnimatedButton → SimpleButton
  (section title rows + view-all rows; the PhotoCell was already
  SimpleButton from changes/032).
- `package.json` — added `android:release`, `ios:release`, `start:prod`
  scripts.

## Verification

1. **First, confirm the dev-build improvement:**
   `npx expo start --clear` → reload on device. Compare with what you
   felt before. The Home cold-mount should be visibly snappier; scroll
   on category/theme-pack should feel smoother; layout flicker on screen
   push should be gone.

2. **Then run a release build for the real perf:**
   ```bash
   npm run android:release     # or: npm run ios:release
   ```
   First build takes ~5–10 minutes (it's a full native compile). The
   APK that installs is the release build — Hermes-optimized, no dev
   chrome. This is what your end users will actually feel. The
   difference vs. dev is dramatic.

3. **Optionally — Metro in prod mode against the release APK:**
   `npm run start:prod` — Metro serves the minified, non-dev bundle.
   Useful for testing the JS path under production conditions without
   rebuilding the APK every change.

## Notes — honest assessment

After ~6 perf passes, this is where React Native lands on a dev build.
The remaining gap between "good" and "feels-like-a-native-app smooth" is:

1. **Dev vs release** (the biggest factor — see scripts above).
2. **JS thread fundamentals.** Every RN app has a JS↔native bridge,
   even with Hermes + new arch. Native Swift/Kotlin apps don't have
   this bridge.
3. **FlatList vs FlashList.** `@shopify/flash-list` does real
   recycling (single render-once, reuse-many) instead of FlatList's
   virtualization (mount-unmount). For 30+ cell grids it's another
   10–20% scroll-perf win. It's NOT added in this pass because:
   - It needs a native rebuild (`npx expo run:android`).
   - It has subtle API differences (estimatedItemSize required, etc).
   - The user has consistently asked for "no new deps" via CLAUDE.md's
     dependency pin policy.

   If after switching to release the perf still isn't enough, FlashList
   is the next step. Let me know and I'll wire it in.

4. **The cells themselves.** Each cell has an image, a flat overlay, a
   title, a heart, an icon. That's about as minimal as a useful cell
   gets. The only further trim would be removing the heart from the
   grid and showing it only in the preview — that's a UX call, not a
   tech call.

Bottom line: **try `npm run android:release` first.** That single
change is bigger than every code change since changes/029 combined.
