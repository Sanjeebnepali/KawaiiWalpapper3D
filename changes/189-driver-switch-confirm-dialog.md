# Change 189: Confirm before switching background mode (stop "shuffle silently stopped")

## Problem

User: "friend check-in now works, but the shuffle one doesn't — I set 5 min, the
time finishes and it stays on the same image, it doesn't change."

On-device diagnosis (via `adb dumpsys activity services` + `dumpsys alarm`):
shuffle was **not running at all** — no `ShuffleForegroundService`, no
`expo.modules.shuffleforeground.FIRE` alarm, zero `ShuffleFG` logcat lines.
`ContextMoodForegroundService` (Mood-based) WAS running. So the wallpaper never
changed because the shuffle driver had been switched OFF.

Root cause is the **mutual-exclusivity rule** (`lib/automationMode.ts`, from
change 185): Theme shuffle / Mood-based / Friend check-in are three continuous
"drivers" and only ONE may run at a time — enabling one calls
`enforceSingleDriver`, which turns the others off. The user had just enabled
Friend check-in (and later Mood-based) to test them; each of those silently
stopped the Theme shuffle. The rule worked as designed, but the only feedback was
a transient ~2-second toast AFTER the switch ("… · Theme shuffle paused"), which
is easy to miss — so it read as "shuffle is broken."

The rotation engine itself is fine (AlarmManager-driven, verified on-device in
change 185; untouched since). The defect was **discoverability**: the trade-off
was effectively silent.

## Solution (owner's choice: keep one-at-a-time, but make it explicit)

Replace the after-the-fact toast with a **confirmation dialog BEFORE the switch**,
at all four points where enabling a driver would pause another:

- `app/shuffle/[id].tsx` — activate a collection
- `app/wallpapers/theme-packs.tsx` — "Shuffle this pack"
- `app/(tabs)/mood.tsx` — enable Mood-based
- `app/(tabs)/mood.tsx` — enable Friend check-in

New helper `lib/confirmDriverSwitch.ts`:

```
confirmDriverSwitch({ keep, enablingLabel, onConfirm })
```

- Computes `otherActiveDriverLabels(keep)`. If nothing else is active → runs
  `onConfirm` immediately (no dialog — the common first-feature case stays one tap).
- Otherwise shows a `premiumAlert` ("Turn on X? … this will pause Y. You can
  switch back anytime.") with Cancel / Turn on, and runs `onConfirm` only on
  confirm.

Each call site's activation body was extracted so it can be deferred behind the
confirm: shuffle screen → `activateShuffle`; theme-packs → inline `onConfirm`;
mood → `enableBackgroundMood(stepStatus)`; friend → `enableFriendCheckIn`. The
old "… paused" toast suffix was removed (the dialog now states the pause up front).

`enableFriendCheckIn` reads the interval via `useMoodStore.getState()
.friendCheckInMinutes` at call time rather than a closed-over value, so a memoized
caller can't schedule with a stale interval (the dep that was dropped from the
`useCallback`).

## Files changed

- `lib/confirmDriverSwitch.ts` — NEW. The confirm-before-switch helper.
- `app/shuffle/[id].tsx` — gate activation behind `confirmDriverSwitch`; split
  body into `activateShuffle`; swap import.
- `app/wallpapers/theme-packs.tsx` — gate "Shuffle this pack" behind the confirm;
  swap import.
- `app/(tabs)/mood.tsx` — gate Mood-based + Friend check-in behind the confirm;
  split `enableBackgroundMood` / `enableFriendCheckIn`; swap import.

## Verification

- `npx tsc --noEmit` → exit 0.
- `npm test` → 13 suites, 203 tests, pass.
- Behaviour reasoning confirmed on-device: with Mood-based ON, the shuffle service
  and its alarm are absent (the rule stopped it). The engine itself was verified
  rotating in change 185. JS-only change → reaches the device via a rebuild
  (`run`); no native recompile needed for the logic, but a release rebuild
  re-embeds the JS bundle.

## Notes

- This does NOT change the one-at-a-time rule — the owner chose to keep it and
  just make the switch explicit. Shuffle still won't run *while* Mood-based or
  Friend check-in is on; the dialog makes that a conscious choice, not a surprise.
- Sleep/Wake and the daily reminder remain non-driver "layers" (unaffected).
