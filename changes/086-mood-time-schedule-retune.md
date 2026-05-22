# Mood-by-time schedule retuned (morning = excited)

**Date:** 2026-05-21
**Type:** fix

## Problem

Owner wants the Mood-based feature to be the main all-day automatic mode that
"confirms what mood it is now and applies accordingly," with the energy
front-loaded to the morning (morning = excited). The auto-by-time engine
already existed (`contextMood.ts` + the context-mood foreground service from
changes/075), but its mapping started the day on `happy` and carried
weekday-special-cases (Monday morning → neutral, weekend evening → excited)
that made "every morning I get Excited" not actually hold.

## Solution

Retuned `inferContextMood` to the owner-approved, weekday-independent schedule:

| Time | Mood |
|---|---|
| Morning (06–10) | 🤩 Excited |
| Mid-day (10–14) | 😊 Happy |
| Afternoon (14–18) | 😌 Calm |
| Evening (18–22) | 😌 Calm |
| Night (22–06) | 😢 Soft / sleepy |

Removed the weekday branches (Monday/Sunday/weekend) so the schedule is
predictable — the file's own design note says predictability is the point
("a user who notices 'every morning I get Excited' can understand why, which
builds trust"). Kept the motion override (≥800 steps/h → excited, ≥300 →
happy): it only fires when there's real step data and it reinforces, never
contradicts, the morning-energy intent.

This is the time→mood logic only. The "make Mood-by-time the main/default
mode" decision and a good mood-tagged wallpaper set are content work that
depends on the owner's real images (still pending the image folder) — tracked
separately.

## Files changed

- `lib/contextMood.ts` — new time-of-day → mood mapping; dropped weekday
  special-casing; `weekday` is still accepted in `ContextSignals` (callers
  pass it) but no longer branched on.

## Verification

Ships with the next release build (JS is embedded in the release APK, so it
reaches the phone on rebuild — batches with changes/085). To confirm without
waiting on the OS background cadence:
1. Mood tab → turn on "Auto-change in background" (and make sure a Mood
   Collection is selected, and no Theme shuffle is active — only one auto mode
   runs at a time).
2. Use "Run now" (or change the device clock into each window) and watch the
   reported mood: 6–10 → Excited, 10–14 → Happy, 14–18 / 18–22 → Calm,
   22–06 → Soft.

## Notes

- Mutual exclusivity still applies (changes/080): turning on a Theme shuffle
  disables Mood-based and vice-versa. Owner chose Mood-by-time as the primary
  all-day mode; surfacing/defaulting that (and auto-seeding a mood wallpaper
  set) is queued for the real-images phase.
- The wallpapers Mood pulls from are still placeholders until the owner's real
  images are imported and mood-tagged.
