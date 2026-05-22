# UI redesign: 3-tab bottom bar, Theme Based section, header rework

**Date:** 2026-05-14
**Type:** feature

## Problem

Per design brief, the existing 4-tab layout and home screen needed substantial changes to match a Zedge-style dark "Kawaii" aesthetic:

- Bottom tabs had a Ringtones tab that was being removed entirely.
- Top tab `24H` should become `Theme Packs`.
- Home screen needed a new `Theme Based` horizontal section between Featured and Popular Collections.
- Header needed a baby-silhouette logo (replacing the "Z" letter) and a profile icon with notification dot.
- Tab bar needed real safe-area insets so it sits above iOS home indicator and Android nav buttons (was using a hardcoded `bottom: 16`).
- Layout needed to be truly responsive — `Dimensions.get('window')` at module load doesn't update on rotation.

## Solution

- Deleted `app/(tabs)/ringtones.tsx`.
- Rewrote `app/(tabs)/_layout.tsx`: 3 tabs only (`index`, `ai`, `profile`); `useSafeAreaInsets()` to compute `height = 60 + insets.bottom` and `paddingBottom`; lavender glow ring rendered behind the active tab icon.
- Restructured the header into two rows: top = pink→lavender gradient logo with `Ionicons happy` face + brand text + profile-icon-with-cyan-dot; bottom = search bar at exactly 90% of screen width via `useWindowDimensions()`.
- Created `components/ThemeBasedRow.tsx` — horizontal `<FlatList>` with snap-to-interval, sourced from a new `themes` array in `constants/mockData.ts` (Cyberpunk Baby, Pink Lolita, Rainy Day Mood, Chibi Anime).
- Switched `FeaturedCarousel` and `CollectionGrid` from module-load `Dimensions` to `useWindowDimensions` so cards resize on rotation/split-screen.
- Added a `useEffect` in `app/(tabs)/index.tsx` that calls `StatusBar.setBarStyle('light-content')` on Android (the cross-platform `expo-status-bar` already handles this in the root layout, but Android benefits from explicit re-assertion when the home screen mounts).
- Changed `CategoryIcons` row to `justifyContent: 'space-evenly'` per the brief.

## Files changed

- `app/(tabs)/ringtones.tsx` — **deleted**
- `app/(tabs)/_layout.tsx` — rewritten (3 tabs, safe-area inset, glow ring)
- `app/(tabs)/index.tsx` — added Theme Based section + Android status bar
- `components/Header.tsx` — two-row layout, gradient logo, 90%-width search
- `components/ThemeBasedRow.tsx` — **new**
- `components/FeaturedCarousel.tsx` — `useWindowDimensions`
- `components/CollectionGrid.tsx` — `useWindowDimensions`
- `components/CategoryIcons.tsx` — `space-around` → `space-evenly`
- `constants/mockData.ts` — `'24H'` tab → `'Theme Packs'`; added `themes` array

## Verification

After a clean restart (`npx expo start --clear`, with no stale Metro on 8081):

- Bottom tab bar shows exactly 3 tabs: Wallpapers / AI Generator / My Zedge. Active tab has a lavender glow ring. Bar sits clear of the home indicator on iOS and the gesture pill / nav buttons on Android.
- Home screen header shows logo + brand + profile-with-dot on row 1, search bar at ~90% width on row 2.
- Top tabs include `Theme Packs` (no `24H`).
- A new `Theme Based` section appears between Featured and Popular Collections, scrolling horizontally with 4 cards.
- Rotating the device (or resizing on web) re-flows card widths.

## Notes

- The "cute baby silhouette" logo is currently `Ionicons happy` over a gradient because there are no PNG assets in `assets/`. Drop a real PNG in `assets/` and swap the `<Ionicons>` in `components/Header.tsx` for an `<Image source={require('../assets/...')}/>` when the asset is ready.
- `app/(tabs)/index.tsx` uses `SafeAreaView edges={['top']}` only — the bottom edge is intentionally handled by the floating tab bar's own inset math, not by this SafeAreaView. Don't add `'bottom'` here or you'll get double padding.
- `README.md` still mentions Ringtones in the tabs list; update separately if you want it accurate (left as-is during this change to keep scope tight).
