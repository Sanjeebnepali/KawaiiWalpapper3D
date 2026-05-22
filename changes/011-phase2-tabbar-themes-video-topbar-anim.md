# Phase 2 fixes: bottom tabs, theme system, video player, top-tab animation

**Date:** 2026-05-15
**Type:** feature

## Problem

Five blocking issues from the Phase 2 follow-up brief:
1. Top-tab buttons had a static underline — no animated feedback.
2. Couple Theme + Mood Based were in the top-tab strip; they should be
   bottom-tab-bar destinations.
3. Video player failed to load videos and its controls sat behind the OS
   home indicator.
4. The theme picker was inline in Settings — should be a modal.
5. The 9 premium themes existed but were never applied app-wide.

## Solution

**Issue 2 — Couple/Mood to the bottom tab bar.** Removed `couple-theme` /
`mood-theme` from `topTabs` (mockData) and `ROUTE_BY_TAB` (TopTabs). The
screens moved from `app/wallpapers/*` to `app/(tabs)/couple.tsx` /
`mood.tsx` (route names `couple` / `mood`), so they're real bottom tabs. The
bottom bar is now **five tabs** — `[Generate] [Couple] [Gallery★] [Mood]
[Settings]` — overriding the old "three tabs only" `CLAUDE.md` rule (updated
to match, per explicit user instruction). Stale `wallpapers/couple-theme` /
`wallpapers/mood-theme` Stack routes removed from `app/_layout.tsx`.

**Issue 1 — animated top-tab underline.** `TopTabs` rewritten: each tab is a
`TopTabItem` with a reanimated `withSpring` shared value (`progress`, 0→1)
driving the underline (`scaleX` + opacity) and the label color
(`interpolateColor`). The active tab springs its underline in on mount;
inactive tabs spring it in on press-in for tactile feedback before nav.

**Issue 3 — video player.** Root cause of "videos failing": the URLs used
the bucket `gtv-videos-library`, which doesn't exist — corrected to
`gtv-videos-bucket`. `VideoView` now uses `StyleSheet.absoluteFill` and sits
behind explicitly z-indexed overlays. The close button + controls use
`useSafeAreaInsets()` so they clear notches / the home indicator; the
`<VideoPlayer>` is wrapped in a `<SafeAreaProvider>` inside the Modal so
those insets resolve. Error status now logs via `console.warn` with a
clearer user-facing message.

**Issue 4 — theme picker modal.** `ThemePicker` gained an `onSelect` callback
and flex-sized tiles (`width: '31%'`) so it works in any container. New
`components/ThemeModal.tsx` wraps it in a `@gorhom/bottom-sheet`
`BottomSheetModal`. `profile.tsx` replaced the inline picker with a "Select
Theme" `SettingsRow` (shows the current theme) that presents the modal;
picking a theme dismisses it.

**Issue 5 — global theme.** New `contexts/ThemeContext.tsx`: `ThemeProvider`
reads the theme name from `store/settings.ts`, resolves a `ThemeDef`, exposes
`useTheme()`. `app/_layout.tsx` wraps the app and an inner `RootStack` feeds
the theme into `@react-navigation/native`'s `ThemeProvider` + the `Stack`
`contentStyle`. `CustomTabBar`, `Header`, `TopTabs`, and every screen's
`SafeAreaView` background + title now consume `useTheme()`. Selecting a theme
in Settings re-colors the app shell, tab bar, nav chrome, and all screen
backgrounds live.

## Files changed

- `contexts/ThemeContext.tsx` — NEW (ThemeProvider + useTheme)
- `components/ThemeModal.tsx` — NEW (bottom-sheet wrapper for ThemePicker)
- `app/(tabs)/couple.tsx`, `app/(tabs)/mood.tsx` — NEW route locations (theme-aware); old `app/wallpapers/couple-theme.tsx` + `mood-theme.tsx` deleted
- `components/TopTabs.tsx` — reanimated `withSpring` underline; couple/mood routes removed
- `components/CustomTabBar.tsx` — 5-tab ORDER/META; theme-aware colors
- `components/ThemePicker.tsx` — `onSelect` prop, flex-sized tiles
- `components/Header.tsx` — logo gradient + brand text use `useTheme()`
- `components/VideoPlayer.tsx` — absolute-fill VideoView, safe-area insets, error logging
- `app/wallpapers/video.tsx` — corrected video bucket URLs, `SafeAreaProvider` around the player, theme-aware
- `app/_layout.tsx` — `ThemeProvider` wrap, `RootStack` consumes theme, stale routes removed
- `app/(tabs)/{index,ai,profile}.tsx` — theme-aware backgrounds; profile uses `ThemeModal`
- `app/wallpapers/{dual,theme-packs}.tsx`, `app/category/[id].tsx`, `app/theme-pack/[id].tsx`, `app/search.tsx` — theme-aware backgrounds
- `constants/mockData.ts` — `topTabs` trimmed to the 4 wallpaper formats
- `CLAUDE.md` — tabs section + theme system documented

## Verification

- `npx tsc --noEmit` passes clean.
- `npx expo start --clear`, then on device:
  - Top tabs show only Wallpapers / Video / Dual / Theme Packs, with a
    spring-animated underline; Couple + Mood are bottom tabs.
  - Settings → "Select Theme" opens a bottom sheet; picking e.g. Ocean Blue
    closes it and re-colors backgrounds, tab bar, and nav chrome app-wide.
  - Video grid → tap a video: it loads and plays; close button + controls
    clear the notch / home indicator.

## Notes

- Video playback needs a native rebuild (`npx expo run:android`/`run:ios`) —
  `expo-video` ships native code.
- Deep card components (CategoryIcons, CollectionGrid, ThemeBasedRow, etc.)
  still use static `Colors` + per-item mockData accents — incremental
  migration to `useTheme()`.
- Theme persistence across app restarts needs `persist` + AsyncStorage on the
  settings store (not installed yet) — same deferred follow-up as favorites.
