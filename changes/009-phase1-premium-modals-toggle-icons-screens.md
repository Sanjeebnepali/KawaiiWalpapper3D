# Phase 1: premium bottom-sheet modals, spring toggle, glass icons, top-tab screens

**Date:** 2026-05-14
**Type:** feature

## Problem

A large enhancement brief (premium modals, smooth toggles, flexible slider, premium icons, separate top-tab screens, persistence, haptics, video playback). It would have added 5 native modules to an app that had never been verified to run, plus a third request to migrate to `/src`.

After a senior-dev review with the user, scope was split:

- **Phase 0** — user verifies the current build runs (done separately).
- **Phase 1 (this change)** — everything JS-only, no native rebuild.
- **Phase 2 (later)** — the native-module batch (AsyncStorage persistence, `expo-haptics`, `expo-video` playback) in one deliberate rebuild.

Declined: `/src` reorg (decided against twice; Expo Router's `app/` can't move), Reanimated v3 downgrade (re-breaks the worklets fix from change 001), `@react-native-community/slider` (the existing custom slider works — just fixed its props).

## Solution (Phase 1)

### Premium modals — `@gorhom/bottom-sheet`

- Added `@gorhom/bottom-sheet@^5.2.14`. It is **pure JS** — rides on the already-installed `react-native-reanimated` + `react-native-gesture-handler`, so **no native rebuild**.
- `app/_layout.tsx` now wraps the tree in `GestureHandlerRootView` + `BottomSheetModalProvider` (both required by the library). The old plain `<View>` root was replaced by `GestureHandlerRootView`.
- New `components/PremiumModal.tsx` — reusable `BottomSheetModal` picker. `#1E1E1E` sheet with 24px top corners, grey handle pill, `BottomSheetBackdrop` (tap-outside / swipe-down dismiss). Options are `#2A2A2A` rounded cards: selected = pink border + check-circle, idle = grey border. Each option staggers in with reanimated `FadeInDown.springify()`. Parent holds the ref and calls `.present()` / `.dismiss()`.
- `app/(tabs)/profile.tsx` — the three Alert-based pickers (Theme / Resolution / Quality) replaced with three `PremiumModal` refs. Option lists updated to the brief's values (e.g. resolution `HD (720p)` … `4K`).

### Smooth toggle — `components/SmoothToggle.tsx`

Reanimated `withSpring` (damping 15, stiffness 150). A single `progress` shared value (0→1) drives both the thumb `translateX` and the track/thumb colors via `interpolateColor` — one source of truth. ON pink `#fab3ca` / OFF `#333333` track, white / `#666666` thumb. `SettingsControls.Toggle` now renders `SmoothToggle` instead of the RN `Switch`, so `profile.tsx` didn't change. **This is the first real worklets usage in app code — it doubles as the runtime canary for whether reanimated actually works.**

### Premium icons — `components/PremiumIcon.tsx`

60×60, radius 18, glassmorphism (`expo-blur` + translucent fill + faint `LinearGradient` sheen), `rgba(255,255,255,0.1)` border. Reanimated press-scale (`withSpring` to 0.92 on press-in). Active = pink border + pink glow shadow, icon + label turn pink. `CategoryIcons.tsx` rewritten to map over `PremiumIcon` (filled Ionicons: `flame` / `sparkles` / `grid` / `diamond`). Note: a true gradient-*filled* glyph needs `@react-native-masked-view` (native module) — skipped; the icon stays solid in its accent color, gradient lives in the shell sheen + glow.

### Flexible slider

Kept the change-008 custom `PanResponder` slider. `profile.tsx` now passes `min={5} max={100} step={5}`; default 50 already comes from the settings store. No native module.

### Separate top-tab screens

- New `mockData.ts` data: `videoWallpapers` (8), `dualWallpapers` (6 lock/home pairs), `themePacks` (6 packs, each with 4 preview thumbs + count), plus `getThemePackPhotos` / `getThemePackById`.
- `components/TopTabs.tsx` — "Wallpapers" stays on Home; the other three tabs `router.push` to new screens. Underline always shows on "Wallpapers" since the rest are now separate routes.
- `app/wallpapers/video.tsx` — 2-col grid, 9:16 cards, play-button overlay, title + duration. Tapping shows an Alert noting real playback ships in Phase 2 (`expo-video` + assets).
- `app/wallpapers/dual.tsx` — 2-col grid of lock/home image pairs side by side; tap → "Download Both" confirm Alert.
- `app/wallpapers/theme-packs.tsx` — 2-col grid, each pack a 2×2 thumbnail preview + title + "N wallpapers"; tap → `/theme-pack/[id]`.
- `app/theme-pack/[id].tsx` — pack detail: header + 2-col photo grid (via `getThemePackPhotos`), heart toggle wired to the favorites store, photo tap → `/wallpaper/[id]`.
- All four registered in `app/_layout.tsx` with `slide_from_right`.

## Files changed

- `package.json` — added `@gorhom/bottom-sheet@^5.2.14`
- `app/_layout.tsx` — `GestureHandlerRootView` + `BottomSheetModalProvider`; registered 4 new routes
- `components/SmoothToggle.tsx` — **new** (reanimated spring toggle)
- `components/PremiumModal.tsx` — **new** (`@gorhom/bottom-sheet` picker)
- `components/PremiumIcon.tsx` — **new** (glassmorphism icon + press-scale)
- `components/SettingsControls.tsx` — `Toggle` now wraps `SmoothToggle` (dropped RN `Switch`)
- `components/CategoryIcons.tsx` — rewritten to use `PremiumIcon`
- `components/TopTabs.tsx` — taps navigate to the new screens
- `constants/mockData.ts` — `videoWallpapers`, `dualWallpapers`, `themePacks`, `getThemePackPhotos`, `getThemePackById`
- `app/(tabs)/profile.tsx` — `PremiumModal` refs replace Alert pickers; slider props `min:5/max:100/step:5`
- `app/wallpapers/video.tsx`, `app/wallpapers/dual.tsx`, `app/wallpapers/theme-packs.tsx`, `app/theme-pack/[id].tsx` — **new** screens

## Verification

- `npx tsc --noEmit` → exit 0.
- **Two transient tsc errors were fixed:** `router.push` to the new routes failed `typedRoutes` because expo-router's generated route union (`.expo/types`) is stale until Metro regenerates it. Cast the paths `as Href` — the routes are real, and the cast becomes a no-op once `expo start` regenerates types.
- Runtime not yet verified on device — needs `npx expo start --clear` + a device pass before Phase 2.

On-device checks: modals open as rounded glassy bottom sheets (tap-outside / swipe-down dismiss, options stagger in, selected option has pink border + check); toggles spring; slider runs 5–100 step 5; category icons are glassy with a press bounce; top tabs Video / Dual / Theme Packs open their own screens; theme pack → detail grid.

## Notes

- **`@gorhom/bottom-sheet` leans entirely on the reanimated + gesture-handler stack** — the most fragile part of this project's history. If it crashes at runtime, it's a worklets/gesture-handler setup issue, not a code bug. The `SmoothToggle` is the simpler canary for the same stack.
- Video playback, AsyncStorage persistence, and haptics are **Phase 2** — all need native modules + one rebuild. The Video screen exists (grid + play overlay); only playback is stubbed.
- Loading skeletons from the brief (#6.3) were kept minimal — the category/theme-pack grids are synchronous local data. Add shimmer skeletons when real async fetching lands.
- `themePacks` thumbnails and all photos are still deterministic `picsum` URLs — swap for real assets in `mockData.ts`.
