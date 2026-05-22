# 098 — Add missing location permissions so couple GPS/wallpaper works

**Date:** 2026-05-22
**Type:** fix

## Problem

On the couple dashboard, **"Check GPS" did nothing** when tapped, and the
proximity wallpaper never switched. Both test phones had foreground location
*granted*, yet location sharing never started.

## Root cause (confirmed via adb)

The installed app's manifest was **missing the location permissions**:

- `adb shell pm grant … ACCESS_BACKGROUND_LOCATION` →
  *"Package com.kawaii.wallpapers has not requested permission
  ACCESS_BACKGROUND_LOCATION."*
- The on-disk `android/app/src/main/AndroidManifest.xml` had only 5 basic
  permissions and **no** `ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE_LOCATION`.

The native `android/` project is **stale** — it was generated before
`expo-location` was added to `app.json`, and `expo run:android` reuses the
existing native project without re-running prebuild, so the expo-location
config plugin's manifest additions were never applied. Consequences:

- `FOREGROUND_SERVICE_LOCATION` missing → the location foreground service
  can't start on Android 14+ (target SDK 36).
- `ACCESS_BACKGROUND_LOCATION` missing → `requestBackgroundPermissionsAsync()`
  throws (permission not declared); `onCheckPermission` has no catch, so the
  button silently does nothing.

A full `expo prebuild` to re-sync is currently **blocked**: it fails on a
missing `assets/icon.png` (only `assets/couple/*` exist), and the repo isn't
under git, so a clean regen is risky.

## Solution

Surgical manifest edit — add ONLY the two permissions the config plugin would
have added (they already match `app.json`'s `android.permissions`):

```xml
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
```

The location foreground SERVICE itself (with
`android:foregroundServiceType="location"`) and `ACCESS_FINE/COARSE_LOCATION`
already merge in from `node_modules/expo-location`'s own library manifest —
verified — so only these two permissions were missing.

## Files changed
- `android/app/src/main/AndroidManifest.xml` — added the two location
  permissions (with a comment explaining why they're inline vs. from prebuild).

## Verification

1. Rebuild release + install on both phones.
2. `adb shell dumpsys package com.kawaii.wallpapers | grep BACKGROUND_LOCATION`
   → now present.
3. Couple dashboard → "Check GPS" → now prompts; choose "Allow all the time".
4. Notification "Couple proximity — Sharing location with your partner" appears.
5. Both phones together → both switch to the together image within ~30–60 s.

## Notes

- **Follow-up (proper fix):** restore the missing image assets (`assets/icon.png`
  etc.) and run `npx expo prebuild` so the native project is regenerated from
  `app.json` cleanly. `app.json` already lists these permissions, so a future
  prebuild re-adds them — this manual edit just bridges until then. Editing
  `android/` directly is normally against the project convention, justified
  here because prebuild is blocked and there's no git safety net.
- This is the native side of the couple feature; the JS wiring
  (location task → applyProximityWallpaper) was already correct (#077).
- Vivo V2231 will additionally need battery "No restrictions" + Autostart for
  background (app-closed) reliability — separate, OEM-level step.
