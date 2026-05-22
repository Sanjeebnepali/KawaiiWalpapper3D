# Native one-tap Set-as-Wallpaper + smoothness pass

**Date:** 2026-05-15
**Type:** feature + fix

## Problem

Two user complaints:

1. **Apply only opens a picker — never actually applies.** Change #014
   swapped to `ACTION_ATTACH_DATA` (which on stock Android opens the system
   "Set as wallpaper" dialog on the chosen image), but on Samsung One UI /
   MIUI / ColorOS the receiving activity is a *crop editor* that demands
   re-selecting the image source — exactly the "file picker" the user is
   stuck on. Either way, it's never one-tap: user picks Apply → modal asks
   Lock/Home/Both → OS dialog asks again → crop editor asks again.
2. **App feels paused for ~1 s on every tap.** Several heavily-tapped
   buttons (wallpaper-preview Apply / back / ⋯ / heart, home Header
   search box + profile + logo, category back / retry) were still raw
   `Pressable` with only `opacity: 0.85` on press — no spring scale
   feedback, so the user thinks the tap was dropped. The preview screen
   also paid a hard `setTimeout(220ms)` between dismissing one bottom-sheet
   and presenting the next.

## Solution

### 1. Native `WallpaperManager.setBitmap` module — true one tap

New **local Expo Module** at `modules/wallpaper-setter/` (Android-only,
Kotlin). It exposes `setWallpaper(localUri, target)` which calls
`WallpaperManager.setBitmap(bmp, null, true, FLAG_SYSTEM | FLAG_LOCK | …)`
directly. No system dialog. No crop editor. The wallpaper is applied in
one tap.

- Autolinked via `expo-modules-autolinking`'s default `nativeModulesDir`
  (`./modules`) — no edits to `MainApplication.kt` or
  `AndroidManifest.xml` needed. The module ships its own manifest
  fragment that declares `android.permission.SET_WALLPAPER`, which Expo
  merges into the app manifest at build time. We also add the permission
  to `app.json` under `android.permissions` so a `prebuild` from a clean
  state keeps it.
- `setAsWallpaper()` in `lib/wallpaperActions.ts` checks
  `isWallpaperSetterAvailable` and prefers the native path. If the
  module isn't linked (e.g. a JS-only Metro reload before a native
  rebuild), it falls back to the legacy `ACTION_ATTACH_DATA` path so the
  flow still works while developing.
- iOS is unchanged: no public API exists to set the wallpaper from a
  third-party iOS app. We still save + deep-link to Photos via
  `photos-redirect://`.

### 2. One-tap Apply UX

`app/wallpaper/[id].tsx` Apply button:

- **Tap** → `setAsWallpaper('both')` runs directly. Toast `✓ Applied to
  lock + home`. Button shows `ActivityIndicator + Applying…` while the
  bitmap decode/IPC runs (typically ~150 ms).
- **Long-press (260 ms)** → opens the existing
  `SetAsWallpaperModal` so the user can pick lock / home / both
  explicitly. The ⋯ → Set as Wallpaper menu entry still opens the same
  modal, so the choice surface is preserved for users who want it.

### 3. Smoothness pass

Replaced raw `Pressable + opacity` with the shared `AnimatedButton`
(reanimated spring, no re-renders) in:

- `app/wallpaper/[id].tsx` — back, ⋯, heart, Apply (the screen the user
  taps after every grid cell)
- `components/Header.tsx` — logo, profile, search box (sticky on every
  Home render)
- `app/category/[id].tsx` — back, retry

Removed the `setTimeout(220ms)` chain between bottom-sheet dismiss and
present in `wallpaper/[id]`. gorhom v5's `BottomSheetModalProvider`
already stacks modals correctly — dismissing the menu and presenting
the next sheet in the same tick is visually clean and saves 220 ms of
dead time on every menu → action tap.

`_layout.tsx` adds `animationDuration: 160` to the `wallpaper/[id]`
fade route so the route transition feels snappier (was using the
platform default ~300 ms).

## Files changed

- `modules/wallpaper-setter/expo-module.config.json` — new (Android-only
  module declaration).
- `modules/wallpaper-setter/package.json` — new (private package, points
  `main` at `index.ts`).
- `modules/wallpaper-setter/index.ts` — new (`isWallpaperSetterAvailable`
  + `setWallpaperNative` JS wrappers using
  `requireOptionalNativeModule`).
- `modules/wallpaper-setter/android/build.gradle` — new (applies the
  `expo-module-gradle-plugin`).
- `modules/wallpaper-setter/android/src/main/AndroidManifest.xml` — new
  (declares `SET_WALLPAPER`).
- `modules/wallpaper-setter/android/src/main/java/expo/modules/wallpapersetter/WallpaperSetterModule.kt`
  — new (the `WallpaperManager.setBitmap` AsyncFunction).
- `app.json` — add `android.permissions: ["android.permission.SET_WALLPAPER"]`.
- `lib/wallpaperActions.ts` — `setAsWallpaper` prefers the native module
  on Android; legacy ATTACH_DATA path extracted to a helper used only as
  fallback.
- `app/wallpaper/[id].tsx` — `AnimatedButton`s, one-tap Apply with
  long-press fallback, drop the `setTimeout(220)` chain.
- `app/_layout.tsx` — `animationDuration: 160` on the
  `wallpaper/[id]` route.
- `components/Header.tsx` — `AnimatedButton`s on logo / profile /
  search box; drop dead `searchPressed` style.
- `app/category/[id].tsx` — `AnimatedButton`s on back + retry.

## Verification

Native rebuild is required because new native code shipped:

```bash
npx expo run:android
```

Smoke test on Android:

1. Open any grid → tap a wallpaper → tap **Apply** once. Toast:
   `✓ Applied to lock + home`. Pull down the lockscreen *and* the home
   screen — both are now the chosen image. No OS dialog appears.
2. Open a wallpaper → **long-press Apply** for ~300 ms → existing
   Lock/Home/Both modal appears as before.
3. Open ⋯ menu → "Set as Wallpaper" → same modal appears.
4. Toggle each AnimatedButton — Apply, back, ⋯, heart, Header search /
   profile / logo, category back, retry — they spring-scale on press
   (no longer feel dead).
5. With `--clear` Metro running but **no native rebuild yet**, Apply
   gracefully falls back to the legacy ATTACH_DATA path (toast: `✓ Pick
   "lock + home" in the picker`) — proves the
   `requireOptionalNativeModule` fallback works.

Smoke test on iOS:

1. Apply → photo saved to Photos and Photos app opens via
   `photos-redirect://`. Toast: `Saved to Photos — tap Share › Use as
   Wallpaper (lock + home)`. iOS still has no public API to set the
   wallpaper directly; this is the same path as #014.

## Notes

- `WallpaperManager.setBitmap(bitmap, visibleCropHint, allowBackup, which)`
  is API 24+; min SDK is 24 (`app.json` Expo defaults), so we never
  branch on version. On API < 24 (impossible here) the 2-arg overload
  would have to be used and `FLAG_LOCK` would be unavailable.
- `BitmapFactory.decodeFile` is fine for the project's picsum 720×1280
  sources. If real assets land at much higher resolution, switch to
  bounds-decoding + a sample-size pass to avoid OOM. Bitmap is
  `.recycle()`'d in a `finally` block.
- The module's `AndroidManifest.xml` declares the `SET_WALLPAPER`
  permission so it survives an Expo prebuild even without the
  `app.json` `permissions` entry — both are present for belt-and-braces.
- `expo-intent-launcher` and `expo-media-library` are still imported by
  the legacy fallback. Don't remove them — they're load-bearing for the
  `else` branch and for `saveToGallery` / `shareWallpaper`.
- `index.ts` uses `requireOptionalNativeModule` from the `expo` package
  (re-exports `expo-modules-core`). The `null` it returns on iOS / when
  unlinked is what makes the JS-side fallback work without try/catch
  around module resolution.
- Long-press delay (260 ms) is shorter than the default `Pressable`
  ~500 ms; if users complain Apply is firing during a "long" tap, bump
  it on `app/wallpaper/[id].tsx`'s Apply `AnimatedButton`.
