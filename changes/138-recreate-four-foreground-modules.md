# Recreate the 4 missing foreground-service native modules

**Date:** 2026-05-24
**Type:** fix

## Problem

Same root cause as the WallpaperSetter bug (change 137): the over-broad `android/`
gitignore had swallowed the Android source of every local Expo module, so these four
foreground-service modules were JS-bridge-only and **inert** at runtime
(`requireOptionalNativeModule(...)` → null), meaning their background features fell back
to the OEM-killable `expo-background-fetch` path (the "stops when the app is closed"
reports):

- `shuffle-foreground` — periodic wallpaper rotation while closed.
- `sleep-wake-foreground` — wake/sleep wallpaper at configured hours.
- `context-mood-foreground` — periodic tick → JS context-mood inference.
- `friend-checkin-foreground` — periodic tick → JS "how are you feeling?" prompt.

## Solution

Recreated each module's Android implementation (done in parallel by sub-agents, verified
centrally) to match its existing JS contract (`index.ts`) and declared class name:

Each module = `build.gradle` (the `expo-module-gradle-plugin` pattern, same as
WallpaperSetter) + `AndroidManifest.xml` (FOREGROUND_SERVICE / FOREGROUND_SERVICE_SPECIAL_USE
/ POST_NOTIFICATIONS, + SET_WALLPAPER for the two wallpaper ones, + a `specialUse`
`<service>` with the Android-14 `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`) + `*Module.kt` +
`*Service.kt` (foreground `Service`, `IMPORTANCE_MIN` ongoing notification, 3-arg
`startForeground(..., FOREGROUND_SERVICE_TYPE_SPECIAL_USE)` API-guarded, `Handler.postDelayed`
loop, `START_STICKY`, SharedPreferences persistence for cold restart).

- The two **tick** modules emit `onTick` to JS via a companion `instance` + `sendEvent`.
- The two **wallpaper** modules decode + `WallpaperManager.setBitmap(FLAG_SYSTEM|FLAG_LOCK)`
  natively (shuffle: mode-based index advance + `getLastApplied`; sleep/wake: next-fire
  via `Calendar`).

## Verification

`npx expo run:android --variant release` → **BUILD SUCCESSFUL in 2m 24s** (native cached
— skipped `npm install` since node_modules symlinks are live); all 4
`:*-foreground:compileReleaseKotlin` compiled with no errors; APK installed. Runtime: app
launches (PID alive), **no crash / no FGS-type exception**; `dumpsys package` shows
FOREGROUND_SERVICE, FOREGROUND_SERVICE_SPECIAL_USE, SET_WALLPAPER, POST_NOTIFICATIONS all
`granted=true` (all 4 manifests merged).

## Notes

- Compile + link + launch are verified. The actual **background behaviour** (rotation
  while closed, sleep/wake firing at the hour, tick notifications) can only be confirmed
  by observing the device over time — these were recreated from the JS contracts (the
  originals were lost to the gitignore), so on-device observation is the real proof.
- The gitignore is now fixed (change 137), so this native source is tracked and won't be
  lost again. `modules/*/android/build/` (generated output) stays ignored.
