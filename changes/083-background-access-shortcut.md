# In-app shortcut to battery / autostart settings ("easy for everyone")

**Date:** 2026-05-20
**Type:** feature

## Problem

The background features (shuffle / mood / friend / sleep-wake) only stay
reliable if the user flips two OEM device settings — battery
"No restrictions" and "Autostart / Allow background activity." On
Vivo / MIUI / ColorOS / OneUI / HyperOS the OS kills third-party
background work otherwise, no matter how correctly we schedule it (see
`KNOWN_ISSUES.md` §5).

Until now we only *told* the user to go find those settings. They live in
a different place on every brand and are hard to find. User request:
"make a shortcut for everyone so it's easy to use the app without
problem." — i.e. take the user straight there from inside the app.

## Solution

New `lib/backgroundAccess.ts` (Android-only; no-ops on iOS), built on the
already-present `expo-intent-launcher`:

- **`openBatteryOptimization()`** — tries the ONE-TAP system dialog
  (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` with our `package:` data) →
  falls back to the battery-optimization app list
  (`IGNORE_BATTERY_OPTIMIZATION_SETTINGS`) → falls back to our app-info
  page. So the best available UX on each device, never a dead end.
- **`openAutostartSettings()`** — there's no standard API, so it tries
  each OEM's known autostart component by name. **Vivo first** (the
  project's test device is a Vivo V2231), then Xiaomi/MIUI, Oppo/ColorOS,
  Huawei/Honor, Samsung. First one that resolves wins; otherwise lands on
  app-info.
- **`openAppDetails()`** — universal fallback (battery + autostart +
  notifications all branch from the app-info page).
- **`maybePromptBackgroundAccess()`** — a one-time, gentle prompt shown
  the FIRST time any background feature is enabled, offering to open the
  battery setting. Gated by a persisted `bgAccessPrompted` flag (+ a
  session guard) so it never nags again; deferred 700 ms so the feature's
  own toast lands first.

Wired in:
- `store/settings.ts` — new persisted `bgAccessPrompted: boolean`
  (default false).
- `lib/moodBootstrap.ts` — the store subscribers call
  `maybePromptBackgroundAccess()` the first time mood-bg / friend /
  sleep-wake / an active shuffle turns on.
- `app/(tabs)/profile.tsx` — new **"Background Access"** Settings section
  (Android-only) with two rows: "Allow always-on" → battery dialog, and
  "Autostart" → OEM autostart screen. This is the explicit, always-there
  shortcut the user asked for.
- `modules/shuffle-foreground/AndroidManifest.xml` — declares
  `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` (manifests merge app-wide), which
  is what enables the one-tap dialog rather than the longer list.

## Files changed

**New:** `lib/backgroundAccess.ts`.
**Modified:** `store/settings.ts`, `lib/moodBootstrap.ts`,
`app/(tabs)/profile.tsx`, `modules/shuffle-foreground/android/src/main/AndroidManifest.xml`.

## Verification

NATIVE REBUILD required (new manifest permission + the release APK embeds
the JS bundle).

1. Settings → "Background Access" section (Android) is visible with
   "Allow always-on" + "Autostart" rows.
2. Tap "Allow always-on" → the system "let app always run in background?"
   dialog appears (or the battery list on devices without the one-tap
   dialog). Tap Allow → returns to the app.
3. Tap "Autostart" → on a Vivo, the BgStartUp/autostart manager opens;
   on stock Android, the app-info page opens (graceful fallback).
4. Fresh install → enable ANY background feature (e.g. Shuffle a pack) →
   after the toast, a one-time "Keep it running in the background?"
   prompt appears with "Set it up" → opens the battery dialog. Enable a
   second feature → NO second prompt (one-time gate works).

## Notes

- **Play Store caveat:** `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is a
  policy-sensitive permission on Google Play (apps must justify it). For
  direct-APK distribution it's fine; if listing on Play, either justify
  it in the data-safety form or drop the permission and rely on the
  battery-list fallback (the code already degrades to it automatically).
- OEM autostart component names drift between OS versions; the list is
  best-effort and falls back to app-info, so it never crashes — worst
  case the user lands one tap away from the setting.
- iOS: every function no-ops / routes to `Linking.openSettings()`; there
  is no background wallpaper on iOS to protect.
