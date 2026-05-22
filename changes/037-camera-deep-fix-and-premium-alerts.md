# Camera "wallpaper never changes" deep root-cause + premium alert system

**Date:** 2026-05-17
**Type:** fix + UX overhaul

## Problem

Two user reports on the 036 build:

**1. Camera still doesn't change the wallpaper.** Verbatim: *"i took this in
face for 2 minutes but still it doesnot change … camera open but why mood
remain same when i scan the face."*

**2. Native alerts look "oldish".** *"all popup model looks oldish can you
make it premium all popup model like premium model time set model and so
on."* Wants every native `Alert.alert` replaced with the bottom-sheet
aesthetic the rest of the app already uses (PremiumSheet / WallpaperMenu).

## Root-cause analysis — the camera

Walked through the actual flow with a 2-minute test in mind:

```
t=3s    Scan 1 — frame analysis returns brightness 0.55, activity 0.42
                 → blends with time-context → emotion "happy"
                 → applies wallpaper, lastAppliedMoodRef='happy', lastAppliedAt=3s
t=63s   Scan 2 — frame analysis: brightness 0.55, activity 0.42 (steady room,
                 steady face) → emotion "happy" again
                 → dedupe check: sameAsLast=true AND tooRecent (60s < 5min)
                 → SKIP
t=123s  Scan 3 — same → SKIP
t=183s  same → SKIP
... wallpaper never changes again
```

**The algorithm was correct.** The 034 frame-stats detector intentionally
returns stable moods under stable conditions (lighting + activity barely
change frame-to-frame for someone sitting still). The bug was the **5-minute
re-apply window** in `MoodEngineHost`'s dedupe: "same mood within 5 min =
skip." A user testing the feature for 2 min would see exactly **one** apply
(the first one) and zero changes after.

035's "reduce to 5 min" was a step in the right direction but still way too
long for the test cadence. The right fix: drop time-based dedupe entirely,
rely on `applyInFlightRef` for concurrency, and let `pickPhotoForMood`'s
`excludeId` argument rotate to a different photo from the same bucket on
every scan.

Plus a usability hole: there was no way to manually force a scan to verify
the camera works — the user had to sit through a full 60 s.

## Solution

### Camera fixes (3 changes)

1. **`MoodEngineHost.tsx` — remove time-based dedupe.** Now:
   ```ts
   // Before — 5-minute dedupe window
   if (sameAsLast && tooRecent) return;
   // After — concurrency guard only
   if (applyInFlightRef.current) return;
   ```
   Every detected mood triggers an apply. `pickPhotoForMood(..., excludeId)`
   picks a different photo from the same bucket → visible wallpaper change
   every 60 s even when the mood is steady. Mood changes still apply
   immediately because there's no other gate. The `applyInFlightRef`
   prevents two scans from racing the wallpaper-setter.

2. **Module-level scan trigger.** Added `triggerImmediateMoodScan()` exported
   from `MoodEngineHost.tsx`. The `ActiveEngine` registers its `scanNow`
   callback on mount; UI code can call the global function without prop-
   drilling a ref through the React tree.

3. **"Scan now" button on the Mood Mode card.** Renders only while
   `moodModeEnabled === true`. Calls `triggerImmediateMoodScan()` and
   toasts the result (`✓ Scan done — wallpaper updated`,
   `Camera warming up — try again in 2 s`, `Scan failed — check camera
   permission`, `Mood engine not active`). User can verify the feature
   in 1 second instead of waiting 60.

### Premium alert system

Built `components/PremiumAlert.tsx` — an imperative `Alert.alert` replacement
that renders inside the existing `PremiumSheet` bottom-sheet wrapper. Same
gradient accent strip, themed background, dim backdrop, rounded corners as
WallpaperMenu / ThemeModal / SetAsWallpaperModal.

Three pieces:

- **`PremiumAlertHost`** — singleton component mounted in `app/_layout.tsx`
  next to the ShuffleEngineHost / MoodEngineHost. Owns the bottom-sheet
  ref + current-alert state. Module-level `externalShow` setter exposes the
  presentation API to non-React callers.
- **`premiumAlert(opts)`** — imperative call, identical UX to `Alert.alert`:
  ```ts
  premiumAlert({
    title: 'Camera access blocked',
    message: 'Open Settings to allow camera access.',
    icon: 'lock-closed',     // Ionicons name, shown as a centered chip
    accentColor: Colors.gold, // optional, tints accent strip + icon ring
    buttons: [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ],
  });
  ```
  Buttons render as full-width rounded chips (cancel = grey,
  destructive = red on dark red background, default = themed primary).
  `onPress` fires AFTER the dismiss animation completes (220 ms delay) so
  any follow-up `Linking.openSettings()` doesn't race the close.
- **Adaptive snap point.** Since `PremiumSheet` runs `enableDynamicSizing:
  false`, the host picks a snap point based on button count (`40%`/`55%`/
  `70%`/`82%`) so alerts with 2 buttons aren't oversized and the friend-
  check-in 7-row picker isn't scroll-locked.

### All Alert.alert usages converted

Replaced 19 `Alert.alert` calls across 11 files:

| File | Alerts converted |
|---|---|
| `app/(tabs)/mood.tsx` | 6 (cam-not-installed, cam-blocked, notif×2, hour picker, friend interval) |
| `app/(tabs)/profile.tsx` | 3 (delete account, logout, edit profile coming-soon) |
| `app/wallpapers/dual.tsx` | 1 (set-wallpaper picker) |
| `app/wallpapers/theme-packs.tsx` | 1 (delete collection) |
| `app/shuffle/[id].tsx` | 4 (collection full, pick photos first, clear selection, delete) |
| `app/shuffle/history.tsx` | 1 (clear history) |
| `app/mood/camera.tsx` | 2 (cam-not-installed, cam-blocked) |
| `app/mood/history.tsx` | 1 (clear mood history) |
| `app/category/[id].tsx` | 1 (save wallpaper) |
| `components/WallpaperMenu.tsx` | 3 (set wallpaper, wallpaper info, report) |
| `components/PremiumLock.tsx` | 1 (premium upgrade gate) |

One `Alert.alert(msg)` deliberately left in `profile.tsx:44` — it's the
iOS fallback for the cross-platform `toast()` helper (Android uses
`ToastAndroid`), not a popup; converting it would render a full bottom
sheet for what should be a transient toast.

## Files changed

**New:**
- `components/PremiumAlert.tsx`
- `changes/037-camera-deep-fix-and-premium-alerts.md`

**Modified — camera:**
- `components/MoodEngineHost.tsx` — drop time-based dedupe, expose
  `triggerImmediateMoodScan()`
- `app/(tabs)/mood.tsx` — wire "Scan now" button into Mood Mode card +
  `onScanNow` handler

**Modified — alert host wiring:**
- `app/_layout.tsx` — mount `<PremiumAlertHost />` inside the
  BottomSheetModalProvider

**Modified — Alert.alert conversions:** 11 files (see table above)

## Verification

1. `npx expo run:android --variant release` (JS-only — ~2 min incremental).
2. **Camera fix (the critical one):**
   - Mood tab → flip Mood Mode on
   - First scan happens within ~3 s → wallpaper changes
   - Tap **"Scan now (test camera)"** button on the card → wallpaper
     changes again immediately
   - Tap it 3 more times → wallpaper rotates through different photos
     in the same mood bucket each time
   - This is the "I can see it works" signal — no more 60-second wait.
3. **Continuous behavior:** leave the app open, watch the wallpaper change
   every 60 s while Mood Mode is on. Stable mood = different photo each
   minute; mood change (cover camera) = immediate switch to the new
   bucket's first photo.
4. **Premium alerts everywhere:**
   - Long-press any wallpaper → menu → tap **Set as Wallpaper** →
     bottom-sheet appears (was native alert)
   - Long-press → **Report** → bottom-sheet with red Report button
   - Long-press → **Info** → bottom-sheet with the metadata
   - Profile → **Log out** → bottom-sheet
   - Profile → **Delete account** → bottom-sheet with red accent + warning icon
   - Mood Home → **Friend check-in** → interval row → bottom-sheet with
     6 preset buttons + Cancel
   - Mood Home → **Daily mood prompt** → time row → bottom-sheet with
     3 hour buttons + Cancel
   - Mood Home → tap any locked feature without premium → upgrade sheet
     with gold diamond icon

## Notes

- **Camera tier is now visibly correct.** Every 60 s scan applies a new
  wallpaper. Every "Scan now" tap applies immediately. The previous
  behavior was algorithmically defensible (don't spam apply when mood is
  stable) but UX-broken (user can't tell anything is happening).
- **The friend check-in interval picker now correctly fits 7 buttons**
  thanks to the adaptive snap point. Previously the OS Alert handled
  layout; the bottom-sheet needed an explicit hint.
- **`Alert.alert` is grep-clean except the toast fallback.** Future code
  should use `premiumAlert` for any popup. The toast fallback at
  `profile.tsx:44` should probably move to a real cross-platform toast
  library (or our existing `lib/toast.ts`); that's a chore for another
  pass.
- **Sheet dismiss animation runs before the onPress fires** (220 ms
  delay). This avoids two visible regressions:
  1. Race between sheet close and a follow-up `Linking.openSettings()`
     dispatch — on some Android skins this caused the system Settings
     activity to launch *behind* the still-closing sheet, leaving a
     dimmed UI when returning.
  2. Synchronous setState inside the onPress causing the sheet to flash
     re-rendered content during close. Rendering the next frame after
     the close animation completes avoids both.
- **iOS support:** the PremiumAlertHost works identically on iOS — same
  @gorhom/bottom-sheet underneath. Tested on Android only this round
  since the dev hardware is a Vivo V2231.
