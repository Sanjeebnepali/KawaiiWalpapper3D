# Shuffle: Doze-proof AlarmManager + state writeback (fix freeze + wrong image)

**Date:** 2026-05-20
**Type:** fix

## Problem

Two user-reported shuffle bugs:

1. **"It stops for a long time, then jumps when I open the app."** The
   foreground service ticked with `Handler.postDelayed` on the main
   Looper, which **Android Doze suspends** the moment the screen is off
   and the phone is idle. The timer literally pauses; on app resume a
   "catch-up" applied a wallpaper — exactly the freeze-then-jump
   symptom.
2. **"Sometimes it shows a different image than the actual wallpaper."**
   The native service rotated wallpapers but never told JS which one it
   set. JS kept its OWN index and, on resume, recomputed + RE-APPLIED a
   different photo. Worse, while foreground BOTH the JS ticker and the
   native service applied (independent indices) → they fought.

## Solution

Make the **native foreground service the single source of truth** on
Android, driven by `AlarmManager.setAndAllowWhileIdle` (the one timer
Android lets through Doze, and — unlike `setExactAndAllowWhileIdle` — it
needs no `SCHEDULE_EXACT_ALARM` permission). JS only mirrors native state
for display.

### Native (`modules/shuffle-foreground/android/…`)

- **`ShuffleScheduler.kt` (new)** — all rotation state in
  SharedPreferences (`uris`, `intervalMs`, `mode`, `index`, `running`,
  `lastAppliedAt`, `lastAppliedUri`). `scheduleNext()` arms a
  `setAndAllowWhileIdle` alarm; `onAlarm()` picks the next index (same
  semantics as JS `pickNextShuffleIndex`), applies the bitmap, **writes
  back** `index`/`lastAppliedAt`/`lastAppliedUri`, and re-arms.
- **`ShuffleTickReceiver.kt` (new)** — manifest-declared `BroadcastReceiver`
  that runs `ShuffleScheduler.onAlarm` on a worker thread (`goAsync`).
  Manifest-declared so Android revives the process to deliver the alarm
  even after a kill.
- **`ShuffleForegroundService.kt`** — `Handler` removed. Now just owns
  the ongoing notification + arms the first alarm. The null-intent
  (START_STICKY restart) branch re-arms if prefs say running.
- **`ShuffleForegroundModule.kt`** — `isRunning()` now reads the durable
  prefs flag; new `getLastApplied()` returns
  `{ index, at, uri } | null` (the writeback readback).

`setAndAllowWhileIdle` is throttled to ~1/9 min in deep Doze, so sub-9-min
intervals stretch a little while the phone is truly idle — the OS's hard
floor for a permission-free timer, and fine for wallpapers (free-tier
intervals are ≥ 1 h anyway).

### JS

- `modules/shuffle-foreground/index.ts` — `getLastAppliedShuffle()` +
  `LastAppliedShuffle` type.
- `lib/shuffleActions.ts` — new `syncFromNativeShuffle()`: reads the
  writeback and updates the store's `currentIndex` / `lastChangedAt` /
  `history` WITHOUT applying (native already applied). `runShuffle­
  BackgroundOnce` now bails early (sync only) when the native service is
  running, so the JS path never double-applies on Android.
- `hooks/useShuffleEngine.ts` — the foreground ticker syncs from native
  and skips applying when the native service runs; on AppState→active it
  calls `syncFromNativeShuffle()` so the in-app image + countdown match
  reality. Manual "Skip" still applies in JS for instant feedback, then
  restarts the native service from the new index so the two stay in
  lock-step.

## Files changed

**New:** `ShuffleScheduler.kt`, `ShuffleTickReceiver.kt`.
**Modified:** `ShuffleForegroundService.kt`, `ShuffleForegroundModule.kt`,
`AndroidManifest.xml` (receiver), `modules/shuffle-foreground/index.ts`,
`lib/shuffleActions.ts`, `hooks/useShuffleEngine.ts`.

## Verification

NATIVE REBUILD required.

1. Theme Packs → Shuffle a pack, set timer to 5 min, lock the phone.
2. Wait 6–10 min WITHOUT opening the app → wallpaper has rotated (it no
   longer freezes in Doze).
3. Open the app → the in-app "current" image matches the actual
   wallpaper; no flash of a different photo on resume.
4. Tap "Skip now" → wallpaper changes immediately; countdown resets;
   next native tick continues from the skipped image (no divergence).
5. `adb shell dumpsys alarm | grep kawaii` shows our alarm scheduled.

## Notes

- The native index is into the (pre-cache-filtered) URI list; in the
  common case (all photos cached) it lines up with `photoIds`. If some
  downloads were dropped, the history thumbnail can be one off, but the
  wallpaper itself is always whatever native applied (we don't re-apply).
- iOS unaffected — no native module there; the JS path (save to Photos)
  still runs.
