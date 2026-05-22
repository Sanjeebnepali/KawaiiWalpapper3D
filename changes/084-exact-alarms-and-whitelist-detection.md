# Exact alarms + battery-whitelist detection — fix "stops after counting"

**Date:** 2026-05-20
**Type:** fix

## Problem

After changes/081–083 the user still reported: **"shuffle stops after
counting and never starts a new session to upload wallpaper"** and
**"friend notification gets off when set for a long time."**

Diagnosed live on the connected Vivo V2231 (Android 15) with `adb`:

1. **App was NOT battery-whitelisted** (`dumpsys deviceidle whitelist`
   empty for us). Confirmed the alarms were OVERDUE by 17–39 min —
   Doze/OEM was sitting on them.
2. **`setAndAllowWhileIdle` is INEXACT.** `dumpsys alarm` showed
   `allow_while_idle_window=+1h0m0s` — the OS gives these alarms a **1-hour
   firing window**. So a 5/15-min shuffle tick could drift up to an hour;
   the in-app countdown hits zero and waits for the native apply that
   doesn't come → looks "stopped, never starts again." (The app's foreground
   foreground services and the alarms themselves were verified present and
   correct — it was purely a firing-time problem, not a code bug.)
3. The user's features were **already active before this build**, so the
   on-enable battery prompt (changes/083) never fired — they never got
   nudged to whitelist.

## Solution

1. **Exact alarms.** All three schedulers (shuffle / friend / sleep-wake)
   now use `setExactAndAllowWhileIdle` instead of `setAndAllowWhileIdle`,
   guarded by `canScheduleExactAlarms()` with a fallback to inexact. This
   fires the tick at the precise time (no 1-hour window).
2. **`USE_EXACT_ALARM` permission** declared in all three module manifests
   (plus `SCHEDULE_EXACT_ALARM` maxSdk=32 for API 31–32). `USE_EXACT_ALARM`
   is auto-granted with no user prompt, so `canScheduleExactAlarms()`
   returns true out of the box.
3. **Whitelist detection + smarter prompt.** New native
   `ShuffleForeground.isIgnoringBatteryOptimizations()` →
   `isBatteryWhitelisted()` (lib/backgroundAccess.ts). `maybePrompt­
   BackgroundAccess()` now only nags when NOT whitelisted, re-offers each
   session while still not whitelisted, and `bootstrapMoodFeature` calls
   it AT LAUNCH when any background feature is already active — closing
   the "features were on before the prompt existed" gap.

Exact alarms fix the in-foreground/while-whitelisted timing; the battery
whitelist (which the prompt now actually drives the user to) fixes the
Doze deferral. Together: ticks fire on time, the countdown restarts, and
friend fires on its interval.

## Files changed

**Modified:**
- `modules/shuffle-foreground/.../ShuffleScheduler.kt` — exact alarm +
  `canScheduleExact`.
- `modules/friend-checkin-foreground/.../FriendCheckinForegroundService.kt`
  — exact alarm.
- `modules/sleep-wake-foreground/.../SleepWakeForegroundService.kt` —
  exact alarm.
- 3 module `AndroidManifest.xml` — `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM`.
- `modules/shuffle-foreground/.../ShuffleForegroundModule.kt` +
  `index.ts` — `isIgnoringBatteryOptimizations()`.
- `lib/backgroundAccess.ts` — `isBatteryWhitelisted()`; whitelist-aware
  `maybePromptBackgroundAccess()`. (File was rewritten — a disk-full write
  had truncated it.)
- `lib/moodBootstrap.ts` — launch-time prompt when a feature is already on.

## Verification

NATIVE REBUILD required. On the connected device, change/081-style:

1. Settings → Background Access → "Allow always-on" → grant. (Or the
   launch prompt now appears since a feature is active + not whitelisted.)
2. `adb shell dumpsys deviceidle whitelist | grep kawaii` → present.
3. `adb shell dumpsys alarm | grep -A1 shuffleforeground.TICK` → window
   should now be tiny (exact), not 1h.
4. Shuffle a pack at 5-min interval, lock the phone, wait 6 min → wallpaper
   rotates; reopen → countdown restarted (no "stuck at zero").

## Notes

- **`USE_EXACT_ALARM` is Play-Store-policy-sensitive** (meant for
  alarm/calendar apps), same caveat as changes/083's battery permission.
  Fine for direct-APK distribution; for a Play listing, justify it or
  switch to `SCHEDULE_EXACT_ALARM` + the "Alarms & reminders" user grant
  (the code already falls back to inexact if exact is denied).
- **Disk was 100% full** during this work (machine-wide, 236 GB of
  non-project data). Cleared regenerable build artifacts/caches to
  proceed; the user needs to free space on C: generally.
- Deep Doze still caps exact-allow-while-idle at ~1 fire / 9 min UNLESS
  the app is battery-whitelisted (which removes the cap) — hence the
  whitelist push.
