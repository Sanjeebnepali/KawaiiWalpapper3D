# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Kawaii Baby Wallpapers HD — dark-themed Zedge-style wallpaper app for AI-generated baby characters. Expo SDK 55 + Expo Router + React Native New Architecture.

## Commands

```bash
# Install (--legacy-peer-deps is REQUIRED — see below)
npm install --legacy-peer-deps

# Dev server + reload bundle
npx expo start --clear

# Full native rebuild + install on device (needed when changing app.json, native deps, or babel config)
npx expo run:android
npx expo run:ios

# Release APK (JS embedded, no Metro) + install on connected device
npx expo run:android --variant release --no-bundler
```

No tests, lint, or typecheck scripts are wired up. TypeScript is configured (`tsconfig.json`) but only an editor aid — the build path is Babel via `babel-preset-expo`.

## "run" shortcut — install release APK, NOT Expo dev client

**When the user ends a message with the word `run` (case-insensitive, as a standalone word at the end), build and install the release APK on the connected Android device.**

Exact command to execute:

```bash
npm install --legacy-peer-deps && npx expo run:android --variant release --no-bundler
```

- Run the build in the background (`run_in_background: true`) — it takes 3–10 min on a warm cache, longer on a cold one. Notify the user when it completes.
- The release variant embeds the JS bundle into the APK, so the resulting app runs without Metro / `expo start`. The output APK lands at `C:\Walpapper\android\app\build\outputs\apk\release\app-release.apk` and is auto-installed on the connected device.
- The Expo CLI prints `› Opening kawaii://expo-development-client/?url=…` at the end of the build — that's a cosmetic deep-link attempt by the CLI, NOT the dev client. The installed APK is the release variant; the user opens it from the app drawer.
- Verify a device is connected first with `adb devices`. If no device is listed, surface that to the user before kicking off the build (the build still succeeds but the install step fails).
- Do NOT default to `npx expo start` — that's the Metro dev server path, which is what the user explicitly does NOT want for `run`.

## Change log convention

**RULE: After every change, create a new summary markdown file in `changes/` (`NNN-slug.md`, max 300 lines) with full details (Problem / Solution / Files changed / Verification / Notes) and add a row to the `changes/README.md` index. No exceptions.**

`changes/` is for change history only — durable docs like this file live at the repo root.

## Critical dependency pins (do not "upgrade" casually)

Load-bearing versions. Bumping any without checking the others breaks the build or bundle.

- `react-native-worklets`: **`~0.7.0`** (currently 0.7.4). Reanimated 4.2.1 hard-asserts worklets in the 0.7.x range at gradle build time (`react-native-reanimated/scripts/worklets-version.json` declares `min: 0.7.0`, `max: 0.7`). Worklets 0.8.x fails `:react-native-reanimated:assertWorkletsVersionTask` during `assembleDebug`.
- `babel-preset-expo`: **`~55.0.0`**. Must be at the project root in `devDependencies` even though Expo bundles its own copy under `node_modules/expo/node_modules/`. Metro's transform worker resolves it from the project root and returns HTTP 500 (`Cannot find module 'babel-preset-expo'`) if it's missing.
- `babel.config.js` plugin: **`react-native-worklets/plugin`**, not `react-native-reanimated/plugin`. Reanimated 4 moved the plugin into the worklets package; the old path silently fails to compile worklets.
- **Reanimated stays on v4.** A request to "use Reanimated v3" was declined — downgrading re-breaks the worklets 0.7.x assertion above. v4 covers all current animation needs.

## npm install peer-dep conflict

`react-dom@19.2.6` requires `react@^19.2.6` but the project pins `react@19.2.0` (Expo's pinned version for SDK 55). Plain `npm install` errors out. Always use `--legacy-peer-deps`. Not something to "fix" by bumping React — Expo's autolinking pins it deliberately.

## Metro stale-worker gotcha

When you change `package.json`, `babel.config.js`, add a route file, or anything Metro caches at startup, the running Metro worker on **port 8081** keeps serving stale results — including cached "module not found" errors — even after `--clear`. Symptom: the device keeps getting HTTP 500 with the *same* error that was just fixed.

To recover:
1. Find the holder: `Get-NetTCPConnection -LocalPort 8081 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }`
2. Kill it: `Stop-Process -Id <pid> -Force`
3. Wipe caches: remove `node_modules/.cache` and `$env:TEMP/metro-*`, `$env:TEMP/haste-map-*`
4. Restart: `npx expo start --clear`

The `--clear` flag alone is not enough if the old worker is still bound to the port.

## Architecture

### Routing (Expo Router, file-based)

Expo Router *is* `@react-navigation/native` + `react-native-screens` under the hood — same runtime, file-based instead of hand-wired navigator files. Don't migrate to bare React Navigation; it's churn with zero runtime benefit.

- `app/_layout.tsx` — root. `GestureHandlerRootView` > our `ThemeProvider` (`contexts/ThemeContext`) > `BottomSheetModalProvider` > `RootStack`. `RootStack` reads `useTheme()` and feeds it into `@react-navigation/native`'s `ThemeProvider` + the `Stack`'s `contentStyle` so nav chrome + every screen background re-color with the active theme. Routes: `(tabs)` group, `category/[id]`, `theme-pack/[id]`, `search`, `wallpapers/video`, `wallpapers/dual`, `wallpapers/theme-packs` (all `slide_from_right`), and `wallpaper/[id]` (`transparentModal` + `fade`, overlays the tabs).
- `app/(tabs)/_layout.tsx` — thin: `<Tabs>` with `tabBar={props => <CustomTabBar {...props} />}`. **Five tabs** (`ai`, `couple`, `index`, `mood`, `profile`) — Couple Theme + Mood Based were promoted from the top-tab strip to the bottom bar (DEVELOPMENT_BRIEF Phase 2, Issue 2). All bar UI lives in `components/CustomTabBar.tsx`: fixed visual order Generate (`ai`) / Couple (`couple`) / Gallery (`index`, elevated center button) / Mood (`mood`) / Settings (`profile`). Active color + center button use `useTheme().primary`, `useSafeAreaInsets()` for bottom padding so it clears the iOS home indicator / Android nav buttons.
- `app/(tabs)/index.tsx` — home. Sticky header (Header + TopTabs), then CategoryIcons, CategoryPreviewList, then Featured / Theme Based / Popular Collections. Re-asserts Android status bar `light-content` in a `useEffect`. The Header's profile avatar routes to `/profile`; its search box routes to `/search`. `TopTabs`: "Wallpapers" stays on Home; Video / Dual / Theme Packs `router.push` to the `wallpapers/*` screens (animated underline via reanimated `withSpring`).
- `app/(tabs)/{couple,mood}.tsx` — Couple Theme / Mood Based tab screens (2-col grids; Mood has emotion filter chips).
- `app/wallpapers/{video,dual,theme-packs}.tsx`, `app/theme-pack/[id].tsx` — the top-tab screens (2-col grids, mock data). Video playback is implemented via `expo-video` (`components/VideoPlayer.tsx` + `VideoWallpaperCard.tsx`); needs a native rebuild to run.
- `app/(tabs)/ai.tsx` — AI Generator screen.
- `app/(tabs)/profile.tsx` — full **Settings** page: 7 `SettingsSection`s built from `components/SettingsControls.tsx` primitives (`SettingsSection` / `SettingsRow` / `Toggle` / `RowValue`) plus `components/Slider.tsx`. State lives in `store/settings.ts`. Dropdowns are `Alert`-based pickers; Terms/Privacy open the system browser via `Linking` (not an in-app WebView).
- `app/category/[id].tsx` — full-screen category grid (outside `(tabs)`, so no tab bar). 2-col 1:1 grid. Loads photos via `useFetchWallpapers`, shows loading/error states, heart toggles hit the Zustand store.
- `app/wallpaper/[id].tsx` — full-screen preview. expo-image renders immediately; a `<BlurView>` overlay covers it until `onLoad` fires ("blur on load" UX). `SafeAreaView edges={['top','bottom']}` since it bypasses the tab bar. Heart wired to the favorites store.

### State, data & hooks

- `store/favorites.ts` — **Zustand** store for favorited wallpaper ids. In-memory only (no persistence yet — `persist` middleware + AsyncStorage is a noted follow-up). Use `useIsFavorite(id)` / `useToggleFavorite()` selectors in components; in `FlatList` `renderItem` (not a component) select the `ids` array directly instead, since hooks can't be called there.
- `store/settings.ts` — **Zustand** store for all Settings-screen values (theme, toggles, dropdowns, `maxGenPerDay`). Defaults match the design spec; typed `set(key, value)` updater. In-memory, same persistence follow-up as favorites.
- `hooks/useFetchWallpapers.ts` — loads category photos from local mock data with a `{ wallpapers, loading, error, refetch }` shape. Data is synchronous today; this is the seam for a future remote API — only the hook body changes, not call sites.
- `constants/theme.ts` — all visual tokens (`Colors`, `Radius`, `Spacing`, `Type`) plus the `Themes` catalog (9 `ThemeDef`s) for the premium theme picker. `Colors` is the static dark default; `Colors.pink` (`#fab3ca`) is the base primary accent. Palette tracks `stitch_kawaii_settings_dashboard/DESIGN.md`.
- `contexts/ThemeContext.tsx` — app-wide theme. `ThemeProvider` reads the selected theme name from `store/settings.ts`, resolves it to a `ThemeDef`, and exposes it via `useTheme()`. The app shell, nav chrome, `CustomTabBar`, and every screen background consume `useTheme()`; deep card components still use static `Colors` + per-item accents (incremental migration). To make a component theme-reactive: `const t = useTheme()` and apply `{ backgroundColor: t.bg }` etc. inline (static `StyleSheet.create` can't read context).
- `constants/mockData.ts` — single source of placeholder content. `pic(seed, w, h)` returns deterministic `picsum.photos` URLs (same seed → same image, so layouts stay stable across reloads). `getCategoryPhotos(id, n)` generates a category's photos; `getPhotoById(id)` resolves any featured-or-category photo id (used by the wallpaper route). Swap the URLs here for real assets — no component changes needed.

### Components

Presentational, pull data from `constants/mockData.ts` directly. Conventions:

- **Images: always `expo-image`**, never RN `Image`/`ImageBackground`. Use `contentFit="cover"` and a small `transition` for the fade-in. The `ImageBackground` pattern is replaced by a `<View>` with an `StyleSheet.absoluteFill` `<Image>` as the first child, then overlay content.
- **Toggles: `SmoothToggle`** (reanimated `withSpring`), not RN `Switch`. **Bottom-sheet pickers: `PremiumModal`** (`@gorhom/bottom-sheet`) — parent holds the ref, calls `.present()` / `.dismiss()`. **Category icons: `PremiumIcon`** (glassmorphism + reanimated press-scale).
- **Animation: `react-native-reanimated` v4 worklets** are now used in app code (`SmoothToggle`, `PremiumIcon`, `PremiumModal`). If any of these crash at runtime, suspect worklets/gesture-handler setup, not the component.
- **`typedRoutes` gotcha:** new route files aren't in expo-router's generated route union until Metro regenerates `.expo/types`. `tsc` will reject `router.push` to a brand-new route — cast `as Href` (harmless once types regenerate).
- **Responsive sizing** uses `useWindowDimensions()`, never module-load `Dimensions.get('window')` (doesn't update on rotation/split-screen).
- **Horizontal sections** (Featured, Theme Based) use `<FlatList horizontal>` with `snapToInterval={cardW + GAP}`.
- **Glass-morphism** cards layer absolute `<Image>` → `<LinearGradient>` darkening overlay → `<BlurView>` panel, inside an `overflow: 'hidden'` parent so rounded corners clip.
- Per-item accent colors come from mockData and thread into shadows + dot pills so each card glows its own color.

### Platform notes

- **Android**: target SDK 36, min SDK 24, NDK 27 — Expo plugin defaults, surfaced via the ExpoRootProject plugin in `android/build.gradle`. Don't edit `android/` directly; go through Expo config.
- **iOS/Android id**: `com.kawaii.wallpapers` (from `app.json`).
- **`newArchEnabled: true`** — Fabric/TurboModules on. All deps (Reanimated 4, Worklets, gesture-handler, screens, safe-area-context, expo-image) support it.
- Safe-area: `react-native-safe-area-context` everywhere — `useSafeAreaInsets()` for the tab bar, `SafeAreaView edges={[...]}` per screen.
