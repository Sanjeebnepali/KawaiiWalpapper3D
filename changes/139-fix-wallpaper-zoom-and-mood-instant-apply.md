# Fix over-zoomed applied wallpapers + instant Mood-based first apply

**Date:** 2026-05-24
**Type:** fix

## Problem

Two issues reported from on-device use:

1. **Wallpapers apply too zoomed-in / cropped.** Every native apply path called
   `WallpaperManager.setBitmap(bitmap, null, true, which)` with a `null` crop hint and
   **no pre-scaling**. The system then upscales the source bitmap to fit its *desired*
   wallpaper canvas — which on most launchers is wider/taller than the screen (for
   parallax scrolling). A portrait AI image (e.g. 768×1344) gets blown up onto that
   oversized canvas, so the launcher shows only a zoomed-in center band → "too zoomed,
   gets cropped."

2. **Mood-based shows "no progress."** Theme shuffle (`ShuffleForegroundService`) and
   Sleep/Wake (`SleepWakeForegroundService`) apply the wallpaper *natively* every tick,
   so they visibly work. Mood-based (`ContextMoodForegroundService`) only emits an
   `onTick` event — the actual apply happens in JS (`runMoodBackgroundOnce`). On top of
   that, *neither* path applies immediately on enable; both wait one full interval
   (~30 min) for the first tick. So a user turns Mood Based on, sees nothing change, and
   reads it as broken.

## Solution

**1. Cover-scale to the real screen size before `setBitmap`.** Added a `fitBitmapToScreen`
helper to all three native apply paths. It reads the device's real display size
(`WindowManager.currentWindowMetrics` on API 30+, `DisplayMetrics.getRealMetrics` below),
cover-scales the source bitmap so it fills the screen, then center-crops to exactly the
screen resolution. The system now receives a screen-sized, screen-aspect bitmap, so it
no longer over-upscales → the wallpaper fits properly with minimal edge crop. Falls back
to the original bitmap if the screen size can't be read, and recycles the intermediate
bitmaps. Files:

- `modules/wallpaper-setter/.../WallpaperSetterModule.kt` (one-tap apply from preview)
- `modules/shuffle-foreground/.../ShuffleForegroundService.kt` (`applyWallpaper`)
- `modules/sleep-wake-foreground/.../SleepWakeForegroundService.kt` (`applySlot`)

**2. Immediate apply when Mood Based is enabled.** In the `useMoodStore` subscriber in
`lib/moodBootstrap.ts`, on the `backgroundEnabled` off→on transition we now also call
`runMoodBackgroundOnce()` once, fire-and-forget, so the wallpaper changes the instant the
user flips the toggle instead of after the first 30-min tick. The FGS tick then keeps it
rotating. Runs regardless of FGS availability (the apply itself is JS); the function
re-checks all its own gates (`backgroundEnabled`, `moodCollectionId`, shuffle/sleep-wake
precedence).

## Files changed

- `modules/wallpaper-setter/android/.../WallpaperSetterModule.kt`
- `modules/shuffle-foreground/android/.../ShuffleForegroundService.kt`
- `modules/sleep-wake-foreground/android/.../SleepWakeForegroundService.kt`
- `lib/moodBootstrap.ts`

## Verification

`npx expo run:android --variant release --no-bundler` → **BUILD SUCCESSFUL in 1m 29s**
(native cached; all three modules' `compileReleaseKotlin` recompiled with the new helper,
no errors). `tsc --noEmit` clean. **Install of the APK could not complete** — the device
dropped off USB mid-build (`adb: device not found`); the built APK is at
`android/app/build/outputs/apk/release/app-release.apk` and installs once the device is
reconnected.

## Notes

- The zoom fix is a behavioural change to the actual pixels handed to `setBitmap`; it
  needs an on-device look to confirm the framing is right across the home, lock, and
  shuffle/sleep-wake paths.
- Mood-based still applies via the JS tick while running (unlike Theme/Sleep-Wake which
  apply natively). The immediate-apply makes the *enable* moment show progress; deep
  closed-app reliability for mood would need the context-mood FGS to apply natively (a
  larger rework — noted as a possible follow-up, not done here to avoid risking the
  working Theme/Sleep-Wake paths without device testing).
