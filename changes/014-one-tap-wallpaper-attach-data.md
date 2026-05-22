# One-tap Set-as-Wallpaper (Android ATTACH_DATA + iOS Photos deep-link)

**Date:** 2026-05-15
**Type:** feature

## Problem

`SetAsWallpaperModal` already let the user pick Lock / Home / Both and tap
Apply, but the underlying `setAsWallpaper` helper did the wrong thing on
both platforms:

- **Android**: fired `android.intent.action.SET_WALLPAPER`, which opens
  the system's *generic* wallpaper picker (showing OS gallery wallpapers,
  not the user's image). The user had to find their just-saved image
  again — clearly not one-tap.
- **iOS**: saved to Photos and showed a toast asking the user to go to
  Settings › Wallpaper — three or four manual steps.

## Solution

Rewrite `setAsWallpaper` in `lib/wallpaperActions.ts` to use APIs we
already have installed (no new deps — `CLAUDE.md` is strict about the
pinned dependency chain, and the user explicitly chose the
"Use installed Expo modules" path):

- **Save to MediaStore first** via `MediaLibrary.createAssetAsync`. We
  need the returned `asset.id` on Android to build a content URI
  (`content://media/external/images/media/<id>`) the system picker can
  read across process boundaries — `file://` URIs trip
  `FileUriExposedException` on API 24+.
- **Android**: launch `android.intent.action.ATTACH_DATA` with that
  content URI, `image/jpeg` MIME type, and
  `FLAG_GRANT_READ_URI_PERMISSION` (= 1). This opens the native
  "Set as wallpaper" dialog on the **user's specific image** — they pick
  Home / Lock / Both in the OS dialog and the wallpaper is set. If an
  OEM happens not to register an `ATTACH_DATA` handler, fall back to the
  old `SET_WALLPAPER` intent so the flow degrades gracefully.
- **iOS**: there is no public API for setting wallpaper, and the share
  sheet (`UIActivityViewController` — what `expo-sharing` wraps) does
  not expose "Use as Wallpaper" (that activity lives only inside
  Photos.app's own UI). The honest "one-tap" iOS path is to save to
  Photos and **deep-link straight into Photos** via the documented
  `photos-redirect://` URL scheme, so the user is one tap from
  Photos › Share › Use as Wallpaper.

The user-selected `target` (lock / home / both) is now informational on
both platforms — surfaced in the toast (`✓ Pick "lock screen" in the
picker`) so the user knows which option to tap in the OS dialog.
Programmatically pre-selecting it would require a custom native module
wrapping `WallpaperManager` on Android, which the user opted not to add.

## Files changed

- `lib/wallpaperActions.ts` — replace `setAsWallpaper`:
  - Add `Linking` import from `react-native`.
  - Save via `MediaLibrary.createAssetAsync` (returns asset with id)
    instead of `saveToLibraryAsync` (returns void).
  - Hard-fail with "Gallery permission denied" if media perm denied
    (previously swallowed; without the asset we have no content URI).
  - Android: build content URI, launch `ATTACH_DATA` with
    `FLAG_GRANT_READ_URI_PERMISSION`, fall back to `SET_WALLPAPER`.
  - iOS: best-effort `Linking.openURL('photos-redirect://')`.
  - Updated docblock to spell out the platform constraints.

## Verification

Android:
1. Open any wallpaper, tap ⋯ → Set as Wallpaper, pick a target, Apply.
2. The native Android "Set as wallpaper" dialog opens **on the image you
   were previewing** (not the generic gallery picker).
3. Choose Home / Lock / Both in that dialog → wallpaper is applied.
4. Toast: `✓ Pick "<target>" in the picker`.

iOS:
1. Same flow → Photos.app opens via the `photos-redirect://` deep-link.
2. Toast: `Saved to Photos — tap Share › Use as Wallpaper (<target>)`.
3. User opens the saved image in Photos, taps Share, picks
   Use as Wallpaper, and finishes in the native iOS wallpaper editor.

If gallery permission is denied: toast `Gallery permission denied` and
nothing else happens.

## Notes

- This requires a native rebuild only if the device was last built before
  `expo-media-library` / `expo-intent-launcher` were added (they
  already shipped in #012, so a JS reload is enough here).
- `target` becoming a hint rather than a hard parameter on Android is a
  real limitation of going native-module-free. If a future change adds a
  thin `WallpaperManager` wrapper (Android only), `setAsWallpaper` is the
  single seam to swap — call sites are unchanged.
- Picsum URLs are served as JPEG regardless of extension, so hardcoding
  `image/jpeg` is safe for the current mock data.
