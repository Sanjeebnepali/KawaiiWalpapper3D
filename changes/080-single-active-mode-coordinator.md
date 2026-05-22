# Single-active-mode coordinator — strict mutual exclusivity

**Date:** 2026-05-20
**Type:** fix

## Problem

User report: the automation features fight each other. "While selecting
[shuffle] the friend ask also running — that breaks the effectiveness."
The user wants exactly ONE continuous wallpaper driver running at a time;
selecting one must stop the others.

Before this change, the only coordination was a pair of ad-hoc
"mood ↔ shuffle" guards scattered through `lib/moodBootstrap.ts`. Friend
check-in was **never** coordinated, so it kept running on top of an
active shuffle (or mood) and the two posted/applied over each other.
There was also no boot-time normalization, so a device that had two
drivers persisted as active would restart both fighting engines.

## Decision (product owner)

Confirmed model: **one continuous driver at a time; Sleep/Wake layers on
top.** The exclusive driver set is:

- `theme`  — an active Theme-shuffle collection (any mode, incl.
  "Day-based" — day-based is a shuffle *mode*, not a separate feature).
- `mood`   — Mood-based background rotation.
- `friend` — Friend check-in prompts.

Turning ON any one of these turns the other two OFF. **Sleep/Wake** and
the daily mood reminder are time-of-day LAYERS (fire ≤ twice a day) and
are intentionally never touched. (Couple-proximity is account-bound +
GPS-driven with cross-partner Supabase side effects, so it's left out of
the exclusive set for now; the coordinator is built to fold it in later
in one place.)

## Solution

New module `lib/automationMode.ts` — the single source of truth:

- `DriverId = 'theme' | 'mood' | 'friend'`, a `DRIVERS` array, and
  `DRIVER_LABELS`.
- `isDriverActive` / `getActiveDrivers` read the live store state.
- `enforceSingleDriver(keep)` turns off every driver except `keep`
  (`shuffle.setActive(null)`, `mood.setBackgroundEnabled(false)`,
  `mood.setFriendCheckInEnabled(false)`), returns the labels of what it
  stopped (for a toast), and leaves Sleep/Wake + the daily reminder
  alone.
- `otherActiveDriverLabels(keep)` — for a toast computed BEFORE you flip
  a driver on.
- A re-entrancy guard (`isExclusivitySuppressed`): flipping a driver's
  store flag synchronously notifies that store's subscriber; without the
  guard, the subscriber would re-run its own exclusivity logic →
  A-stops-B-stops-A loop. We suppress only the *exclusivity reaction*;
  the *lifecycle* side effects (stop the foreground service, cancel
  notifications, unregister the bg task) still run.

`lib/moodBootstrap.ts`:
- Both store subscribers now call `enforceSingleDriver(...)` when their
  driver turns on (mood, friend, theme), guarded by
  `!isExclusivitySuppressed()`. This replaces the old partial mood↔shuffle
  guards and ADDS friend coordination.
- **Boot-time normalization**: after hydrating the stores and BEFORE
  starting any services, if `getActiveDrivers().length > 1` we keep the
  highest-priority one (`theme > mood > friend`) and stop the rest — so
  legacy multi-driver state can't restart two fighting engines.

UI toasts now name what was paused, via `otherActiveDriverLabels`:
- `app/(tabs)/mood.tsx` — `onToggleBackground`, `onToggleFriend`.
- `app/shuffle/[id].tsx` — `toggleActive`.
- `app/wallpapers/theme-packs.tsx` — `onShufflePack`.

(The subscribers are the actual enforcement; the UI just reports.)

## Files changed

**New:**
- `lib/automationMode.ts`

**Modified:**
- `lib/moodBootstrap.ts` — subscribers call `enforceSingleDriver`;
  boot-time normalization; imports.
- `app/(tabs)/mood.tsx` — `otherActiveDriverLabels` toasts for mood +
  friend.
- `app/shuffle/[id].tsx` — `otherActiveDriverLabels` toast; dropped the
  now-unused `useMoodStore` import.
- `app/wallpapers/theme-packs.tsx` — same.

## Verification

JS-only — no native rebuild required.

1. Turn on Theme shuffle → turn on Mood-based: toast "Background mood on ·
   Theme shuffle paused"; the shuffle is now inactive.
2. With Mood-based on, turn on Friend check-in: toast "… · Mood-based
   paused"; mood-bg flips off.
3. With Friend on, activate a shuffle: toast "▶ Shuffle on · Friend
   check-in paused".
4. Turn on Sleep/Wake at any point → it stays on through all of the
   above (it's a layer, not a driver).
5. Kill + relaunch with two drivers somehow persisted → only the
   highest-priority one comes back; the other is off.

## Notes

- Sleep/Wake intentionally coexists — it fires at most twice a day and
  doesn't continuously drive the wallpaper, so it won't fight a driver.
- To bring Couple-proximity under the rule later: add a `'couple'` case
  to `isDriverActive` + `enforceSingleDriver` and a label; everything
  else already iterates `DRIVERS`.
