# Day-based shuffle rotates at midnight (was frozen on one image)

**Date:** 2026-05-21
**Type:** fix

## Problem

Owner report: "Day-based is not working." The wallpaper appeared frozen — it
changed once on activation and then never (or seemed never) again.

Root cause: a shuffle collection has two **independent** settings — the
**mode** (Day-based) and the **"Shuffle every" timer** (1h / 6h / …). Day-based
picked its image purely from the weekday (`new Date().getDay() % count`) but
the engine still ticked on the generic timer. So:

- Every timer tick *within the same day* recomputed the same weekday index and
  re-applied the **same image** → looked frozen.
- The image only ever changed when the real weekday flipped at midnight, and
  only if a tick happened to land there.
- With the default/short free timer it re-applied one image all day; with a 24h
  timer the user saw no change for a whole day. Both read as "broken."
- Secondary: weekday-modulo on a 10-image collection only ever used the first 7
  images (Sun–Sat); images 8–10 never appeared.

Battery whitelist + a fresh release rebuild were already confirmed in place, so
this was a real logic bug, not the Doze/alarm-timing class fixed in changes
081–084.

## Solution

Decouple Day-based from the timer entirely. Day-based now rotates **once per
day at local midnight**, advancing **one image per day** so it cycles through
the *whole* collection (owner chose "cycle through all" over "fixed per
weekday").

New single source of truth in `constants/shuffle.ts`:

- `nextLocalMidnight(from)` — 00:00 local of the day after `from`.
- `getNextChangeAt(collection, lastChangedAt)` — next midnight for Day-based,
  else `lastChangedAt + interval`. Shared by the foreground ticker, the
  background single-shot, and the on-screen countdown so all three agree.

Index pick for `'day'` changed from weekday-modulo to `(currentIndex + 1) %
count` in **all three** appliers (JS foreground, JS background, native Kotlin).
Because the tick only fires at midnight, +1 per fire = one new image each day,
walking the entire collection.

Native (`ShuffleScheduler.kt`) is the source of truth on Android while the app
is closed, so it had to learn the midnight cadence too: `nextLocalMidnightMs()`
+ a mode-aware `scheduleNextRotation()` (used by the tick re-arm, boot receiver,
and service redelivery) so Day-based resumes on its midnight schedule after
reboots/kills — not one interval after boot.

UI: the "Shuffle every" timer card is replaced with a "changes automatically at
midnight" note when Day-based is selected; the Theme Packs hub + pack screen
show "Daily" / "New wallpaper daily" instead of "Every N min"; the ongoing
notification reads "A new wallpaper every day" for Day-based.

## Files changed

- `constants/shuffle.ts` — `nextLocalMidnight()` + `getNextChangeAt()` helpers.
- `hooks/useShuffleEngine.ts` — `'day'` index → step-by-one; foreground gating
  + countdown use `getNextChangeAt`.
- `lib/shuffleActions.ts` — `'day'` index → step-by-one; background single-shot
  gating uses `getNextChangeAt`.
- `app/shuffle/[id].tsx` — hide timer options for Day-based, show midnight note;
  `dayNoteRow` / `dayNoteText` styles.
- `app/wallpapers/theme-packs.tsx` — active-collection label "Daily" for Day-based.
- `app/theme-pack/[id].tsx` — active label "New wallpaper daily" for Day-based.
- `modules/shuffle-foreground/.../ShuffleScheduler.kt` — `nextLocalMidnightMs()`,
  `scheduleNextRotation()`, `readMode()`; `start()`/`onAlarm()` mode-aware;
  `'day'` index → step-by-one.
- `modules/shuffle-foreground/.../ShuffleBootReceiver.kt` — re-arm via
  `scheduleNextRotation()`.
- `modules/shuffle-foreground/.../ShuffleForegroundService.kt` — redelivery
  re-arms via `scheduleNextRotation()`; mode-aware notification text.

## Verification

**NATIVE REBUILD required** (Kotlin changed): `npx expo run:android --variant
release --no-bundler`.

Then, with a Day-based collection:
1. Edit the collection → pick "Day-based". The timer list is replaced by the
   "changes automatically at midnight" note. ✓
2. Start it. Wallpaper applies immediately (image 1). The Active-screen
   countdown reads "Next change in" counting down to tonight's midnight; the
   ongoing notification says "A new wallpaper every day". ✓
3. Fast path to confirm rotation without waiting for real midnight: set the
   device clock to ~11:59 PM, lock the phone, wait past 12:00 AM → the
   wallpaper advances to image 2 (then image 3 the next day, … looping after
   the last). Reboot mid-cycle → it still flips at the next midnight.

## Notes

- Day-based now ignores the "Shuffle every" timer by design; the timer still
  exists for Sequential / Random / Smart modes.
- The collection still stores a `timerId`; native just doesn't use it for
  scheduling when `mode === 'day'`. Harmless, and keeps the data model intact
  if the user switches modes.
- iOS path advances state at midnight too (via `getNextChangeAt`) but Apple
  still forbids programmatic apply — unchanged from before.
