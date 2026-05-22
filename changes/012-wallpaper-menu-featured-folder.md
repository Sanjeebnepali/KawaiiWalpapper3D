# Wallpaper menu, Featured Folder, heart polish

**Date:** 2026-05-15
**Type:** feature

## Problem

Production-ready wallpaper preview needs a working action menu, real
favorites feedback, and a Featured Folder setting. From the Phase 2 follow-up
brief Features 1, 3, 4, 6, 7. Feature 2 (image editor) was scoped out for a
dedicated round; Feature 5 (global theme) was already done in change 011.

## Solution

**Native dependencies installed** (per the user's explicit approval, picks
SDK-55-compatible versions; needs a native rebuild before running):

- `expo-sharing` (system share sheet)
- `expo-media-library` (gallery save + Featured Folder album)
- `expo-image-manipulator` (for the deferred editor — installed now so the
  next round doesn't need another rebuild)
- `expo-intent-launcher` (Android SET_WALLPAPER intent)
- `expo-file-system` (download remote image → local cache)
- `expo-clipboard` (Copy Link)

`app.json` plugins updated: `expo-media-library` added with iOS photo-library
permission strings. The Expo install auto-added `expo-sharing` to plugins.

**`lib/wallpaperActions.ts` (NEW)** — shared helpers. Every export returns
`{ ok, message }` and never throws; the UI shows a single toast either way:

- `saveToGallery(url, id, useFeaturedFolder)` — downloads to cache, then
  `MediaLibrary.saveToLibraryAsync` or routes through `createAssetAsync` +
  `getAlbumAsync` / `createAlbumAsync` for the "Kawaii Baby" album.
- `shareWallpaper(url, id)` — downloads then `Sharing.shareAsync`.
- `setAsWallpaper(url, id, target)` — downloads, saves to gallery (best-
  effort), on Android opens the system wallpaper picker via
  `IntentLauncher.startActivityAsync('android.intent.action.SET_WALLPAPER')`,
  on iOS toasts a guide to Settings › Wallpaper. Setting a *specific* image
  programmatically would need a custom native module + FileProvider — out of
  scope.
- `copyLink(url)` — `Clipboard.setStringAsync`.
- Uses `expo-file-system/legacy` for `downloadAsync` (stable across SDKs).

**`lib/toast.ts` (NEW)** — `ToastAndroid` on Android, `Alert.alert` on iOS.
Empty messages are no-ops (share sheet provides its own UX).

**`components/WallpaperMenu.tsx` (NEW)** — `forwardRef<WallpaperMenuRef>` that
internally owns a `BottomSheetModal` and exposes `present` / `dismiss` via
`useImperativeHandle`. Ten options, all working:

📥 Save to Gallery · 📤 Share · ✏️ Edit Image (toast: coming soon) ·
❤️ Add/Remove Favorite · 🎨 Set as Wallpaper (Lock/Home/Both alert →
`setAsWallpaper`) · 💾 Save to Featured Folder · 🔗 Copy Link ·
ℹ️ Wallpaper Info · ⭐ Rate This · 🚫 Report

Themed via `useTheme()` (favorite row glows `theme.primary`). Each handler
dismisses the sheet immediately, runs the async helper, then toasts the
result — keeps the UX responsive.

**Feature 3 — heart polish.** `wallpaper/[id].tsx` now uses
`useIsFavorite(id)` + `useToggleFavorite()` (instead of reading the whole
favorites array), heart glows `theme.primary` when active (added border +
shadow), tap shows a toast: "✓ Added to favorites" / "Removed from
favorites". The previously dead ellipsis button presents the menu.

**Feature 4 — Featured Folder setting.** `store/settings.ts` gains
`featuredFolder: boolean` (default `false`). `profile.tsx` has a new
"Wallpaper Management" section with a "Featured Folder" `Toggle`. When on,
"Save to Gallery" routes through the `Kawaii Baby` album.

**Feature 7 — error handling.** Permission denial, download failures,
sharing unavailability, and store-open failures all surface clear toasts.
Album-creation failure falls back to standard `saveToLibraryAsync`. Set-as-
wallpaper non-fatal-saves the image even if the picker step fails.

## Files changed

- `lib/toast.ts` — NEW
- `lib/wallpaperActions.ts` — NEW
- `components/WallpaperMenu.tsx` — NEW
- `app/wallpaper/[id].tsx` — menu wired, heart polish, themed loader
- `app/(tabs)/profile.tsx` — Wallpaper Management section + Featured Folder toggle
- `store/settings.ts` — `featuredFolder: boolean`
- `app.json` — `expo-media-library` plugin with iOS permission strings
- `package.json` — six new SDK-55-compatible native dependencies

## Verification

- `npx tsc --noEmit` passes clean.
- **Requires `npx expo run:android` / `run:ios`** to install the native
  modules — `npx expo start --clear` alone will fail at runtime with
  "native module not found" for these libraries.
- After native rebuild, on device:
  - Wallpaper preview → ellipsis button → bottom sheet with 10 options.
  - Save / Share / Copy Link / Set Wallpaper all work; correct toasts.
  - Settings › Wallpaper Management › Featured Folder ON → Save creates
    "Kawaii Baby" album in the gallery; OFF → default location.
  - Heart toggles + glows `theme.primary` when active.

## Notes

- Setting a *specific* image as wallpaper without a custom native module
  isn't possible cross-platform — Android opens the system picker, iOS
  toasts a guide; both save the image first so the user can complete the
  flow manually. Matches the existing `dual.tsx` pattern the brief
  referenced.
- Feature 2 (image editor) — deferred to its own round. `expo-image-
  manipulator` was installed in advance so that round avoids another
  rebuild.
- Favorites + theme persistence across app restarts still needs `persist` +
  AsyncStorage on the relevant stores (not installed yet) — same deferred
  follow-up flagged in changes 010 and 011.
