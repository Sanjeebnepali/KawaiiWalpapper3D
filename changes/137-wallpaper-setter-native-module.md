# Recreate the WallpaperSetter native module — fixes "apply wallpaper opens contacts"

**Date:** 2026-05-24
**Type:** fix

## Problem

Applying a wallpaper opened the **contacts page** ("set contact photo for a phone
number") instead of setting the wallpaper. Root cause (diagnosed in this session): the
local Expo module `modules/wallpaper-setter` had its JS bridge + config but **no Android
implementation** — because `.gitignore` line 10 was the over-broad `android/`, which also
matched `modules/*/android/`, so the native Kotlin was never committed and was absent on
this checkout. With no native module, `isWallpaperSetterAvailable` was `false` at runtime,
so `setAsWallpaper()` fell to the legacy `ACTION_ATTACH_DATA` intent — which OEM skins
route to "Set contact photo." Every "Set wallpaper" entry point funnels through
`setAsWallpaper`, so all of them hit it.

## Solution

1. **`.gitignore`**: `android/` → `/android` (anchored to root). Now the root prebuild
   stays ignored but `modules/**/android/` source is tracked.
2. **Recreated the native module** `modules/wallpaper-setter/android/`:
   - `WallpaperSetterModule.kt` — `AsyncFunction("setWallpaper")` decodes the local image
     and calls `WallpaperManager.setBitmap(bitmap, null, true, which)` with
     `FLAG_SYSTEM`/`FLAG_LOCK`/both. One tap, no picker, no contacts.
   - `AndroidManifest.xml` — declares `android.permission.SET_WALLPAPER` (merged into app).
   - `build.gradle` — uses the `expo-module-gradle-plugin` (provides Kotlin +
     expo-modules-core). (First attempt used the older `apply from`/`useDefaultAndroidSdkVersions`
     pattern which omitted the core dependency → `Unresolved reference 'kotlin'`; the
     plugin form fixed it.)

## Files changed

- `.gitignore`; `modules/wallpaper-setter/android/build.gradle`,
  `…/src/main/AndroidManifest.xml`, `…/src/main/java/expo/modules/wallpapersetter/WallpaperSetterModule.kt` (new).

## Verification

`npx expo run:android --variant release` → **BUILD SUCCESSFUL**;
`:wallpaper-setter:compileReleaseKotlin` compiled with no errors; APK installed on the
device. Runtime: app launches (PID alive), no crash; `dumpsys package` shows
`android.permission.SET_WALLPAPER: granted=true` (module manifest merged). The
contacts-routing `setAsWallpaperLegacyAndroid` fallback is now unreachable on Android
(native path is used). Final one-tap behaviour is an on-device tap-test (can't be scripted).

## Notes

- The OTHER local modules (`shuffle-foreground`, `context-mood-foreground`,
  `friend-checkin-foreground`, `sleep-wake-foreground`) are ALSO missing their Android
  source for the same gitignore reason — their native features (FGS shuffle, etc.) are
  similarly inert. Out of scope here; flagged for a follow-up if those features matter.
- The native CMake recompiled this build because `npm install` touched node_modules
  (timestamps) — future module-only rebuilds can skip `npm install` to stay cached (~5 min).
