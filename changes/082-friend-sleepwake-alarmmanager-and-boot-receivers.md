# Friend + Sleep/Wake: Doze-proof AlarmManager + reboot resume

**Date:** 2026-05-20
**Type:** fix

## Problem

1. **Friend check-in "comes minutes late, or doesn't fire."** The friend
   foreground service ticked with `Handler.postDelayed`, suspended by
   deep Doze (same root cause as the shuffle freeze in changes/081).
2. **Sleep/Wake could drift ~10 min** at the hour boundary for the same
   reason (its `postDelayed` schedule slept through Doze).
3. **"Doesn't work when the phone was off."** Android does NOT
   auto-restart foreground services across reboots, so every feature was
   dead after a restart until the user opened the app once. (A powered-OFF
   phone runs nothing — that's physics — but a *reboot* can resume.)

## Solution

### Friend check-in (`modules/friend-checkin-foreground/`)

- **`FriendAlarmReceiver.kt` (new)** — manifest receiver that, on each
  alarm, invokes the JS `tickCallback` (which posts the 7-mood prompt)
  and re-arms the next alarm.
- **`FriendCheckinForegroundService.kt`** — `Handler` removed; cadence
  now driven by `AlarmManager.setAndAllowWhileIdle`. Persists a `running`
  flag + interval; companion exposes `scheduleNextAlarm` / `cancelAlarm`
  / `isRunningPref` / `readIntervalPref` for the receivers.

The FGS still runs — it keeps the process (and JS bundle + `tickCallback`)
alive so the rich notification can be posted. The alarm just replaces the
Doze-suspended timer.

### Sleep/Wake (`modules/sleep-wake-foreground/`)

- **`SleepWakeAlarmReceiver.kt` (new)** — manifest receiver; runs the
  apply on a worker thread (`goAsync`).
- **`SleepWakeForegroundService.kt`** — `Handler` removed. The companion
  computes the next wake/sleep clock time, persists which kind is next,
  and arms `setAndAllowWhileIdle` for that absolute time; `onAlarm`
  applies that wallpaper natively and arms the following boundary.

### Reboot resume (all three FGS modules)

- **`ShuffleBootReceiver.kt`, `FriendBootReceiver.kt`,
  `SleepWakeBootReceiver.kt` (new)** — `BOOT_COMPLETED` (+
  `QUICKBOOT_POWERON`) receivers. If the feature was running (durable
  prefs flag), they **re-arm the alarm** and best-effort restart the FGS
  (try/catch around the Android-12+ background-FGS-start limit; the alarm
  is what matters).
- Because rotation is now alarm-driven and applies natively,
  **Shuffle + Sleep/Wake resume fully after reboot with no app open.**
  Friend re-arms its cadence but its first prompt lands once the app is
  next opened (the prompt is posted by JS, which only loads on app open).

Manifests gain `RECEIVE_BOOT_COMPLETED` + the new `<receiver>` entries
(tick receivers `exported=false`; boot receivers `exported=true` with a
BOOT_COMPLETED intent-filter — a protected system broadcast).

## Files changed

**New:** `FriendAlarmReceiver.kt`, `FriendBootReceiver.kt`,
`SleepWakeAlarmReceiver.kt`, `SleepWakeBootReceiver.kt`,
`ShuffleBootReceiver.kt`.
**Modified:** `FriendCheckinForegroundService.kt`,
`SleepWakeForegroundService.kt`, and all three modules'
`AndroidManifest.xml`.

## Verification

NATIVE REBUILD required.

1. Friend: set 2-min interval, lock the phone, wait 6 min → prompts
   arrive ~on time (not in a burst on unlock).
2. Sleep/Wake: set wake hour to "now + 2 min", lock, wait → wallpaper
   applies within ~the minute (not 10 min late).
3. Reboot the phone with an active Shuffle → after boot, wait one
   interval WITHOUT opening the app → wallpaper rotates.
4. Reboot with Sleep/Wake on → the next wake/sleep boundary applies
   without opening the app.
5. `adb shell dumpsys alarm | grep kawaii` shows the re-armed alarms
   after boot.

## Notes

- `setAndAllowWhileIdle` is inexact (~1/9 min ceiling in deep Doze) — it
  bypasses Doze without the Play-Store-restricted `SCHEDULE_EXACT_ALARM`.
  For "wake around 7am" / "check in every N min" this is the right
  trade-off.
- **Powered-OFF** ≠ reboot: nothing runs while the device is off; the
  boot receiver resumes things once it powers back on and finishes
  booting.
- OEM autostart/battery whitelisting still applies on Vivo/MIUI/ColorOS —
  no API can flip those for the user (see `KNOWN_ISSUES.md`).
- Updates `KNOWN_ISSUES.md` items #1.1, #1.2, #2.3 (Doze drift + reboot +
  native AlarmManager friend cadence) from "not done" to done.
