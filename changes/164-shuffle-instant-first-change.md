# Shuffle applies the first wallpaper instantly on start

**Date:** 2026-05-25
**Type:** fix

## Problem

After starting an auto-shuffle, the **first** wallpaper change was delayed — up
to a full interval (15–30 min) — instead of changing right away.

## Diagnosis

`ShuffleForegroundService.armTick()` scheduled the first `rotate()` at
`intervalMs` (`handler.postDelayed(runnable, intervalMs)`) — the native service
never applied anything at start; it waited one whole interval for its first
tick. The instant first change relied entirely on the JS-side
`applyCollectionPhoto(…, 0)`, which isn't fired by every start path and can be
beaten by the FGS taking over. When the JS instant-apply didn't happen, the user
stared at the old wallpaper until the first native tick a full interval later.

## Solution

`armTick(applyNow)` now applies the START index **immediately** on a fresh,
JS-initiated start (the intent carries config extras), then schedules the
interval loop as before. The shuffle images are precached to local `file://`
paths before `start()`, so this immediate apply is a fast on-disk decode, not a
download. A null-intent `START_STICKY` restart by the OS is treated as NOT fresh,
so it re-arms from persisted state without re-flashing the wallpaper.

## Files changed

- `modules/shuffle-foreground/android/.../ShuffleForegroundService.kt` —
  `armTick(applyNow)` + immediate first apply on fresh start.

## Verification

- Kotlin-only — `tsc` unaffected (last run 0 errors).
- **Needs a native rebuild** (`npx expo run:android`).
- On-device: start a shuffle from a theme pack → the wallpaper changes
  immediately, then rotates on the chosen timer.

## Notes

- Paired with changes/163 (mood-notification tap) — a single rebuild lands both.
- The JS-side instant apply is left in place; it still covers iOS / pre-rebuild
  where the native service isn't linked. The double-apply on Android (native +
  JS, same index/image) is a harmless no-op visually.
