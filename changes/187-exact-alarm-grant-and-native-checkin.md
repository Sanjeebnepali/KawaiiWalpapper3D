# Change 187: Doze-proof timed wallpaper changes (exact-alarm grant) + native friend check-in

## Problem

Four user-reported background bugs, all about timed wallpaper changes not firing
reliably while the app is closed and the screen is off:

1. **Shuffle "stops" after the first interval.** User picks a theme pack, sets an
   interval; the first change happens, then nothing — it appears to halt and never
   starts a new session.
2. **Mood-based ("footstep") doesn't change on its 30-min cadence.** Sometimes it
   changes once, then goes 2–3 h with no change.
3. **Friend check-in never notifies.** Set to 1 min, waited a long time, no
   notification ever arrived.
4. **Sleep/Wake fires ~1 h late.** User sets 9 AM; the wallpaper changes at 10 AM —
   a consistent +1 h offset.

## Root cause

**Bugs 1, 2, 4 share ONE cause: exact alarms were never actually granted, so every
service silently ran on Doze-deferred inexact alarms.**

All four native foreground services re-arm their next fire with
`AlarmManager.setExactAndAllowWhileIdle`, but fall back to `setAndAllowWhileIdle`
whenever `canScheduleExactAlarms()` is false (e.g.
`ShuffleForegroundService.kt:145`, `SleepWakeForegroundService.kt:250`,
`ContextMoodForegroundService.kt:238`). The module manifests declared only
`SCHEDULE_EXACT_ALARM` — which is **NOT auto-granted on Android 13/14+** — and the
app never drove the user to grant it (`openExactAlarmSettings()` in
`lib/backgroundAccess.ts:71` exists but is never called). So on any modern phone
`canScheduleExactAlarms()` returned false and every feature ran on
`setAndAllowWhileIdle`, which Doze defers to maintenance windows. That single fact
explains all three timing symptoms:

- Sleep/Wake 9 AM → next Doze window after 9 → ~10 AM. (NOT a picker/timezone bug —
  the picker → store → native all pass `9` correctly; verified end to end.)
- Mood 30 min → deferred to windows that spread further apart the longer the phone
  idles → "2 h, 3 h."
- Shuffle 30 min → next change hours out → looks "stopped." (Confirmed there is NO
  session/duration/run-once logic anywhere; the architecture runs forever.)

**Bug 3 has a second, independent cause.** Unlike the other three (which apply the
wallpaper natively), friend check-in's service only called
`FriendCheckinForegroundModule.instance?.emitTick()` and relied on **live JS** to
post the prompt. When the app process is dead — the normal background state, and
the default on Vivo/MIUI/ColorOS — `instance` is null and the tick vanished. (Also
the "1 min" request is raised to the 15-min Android floor, which is expected.)

## Solution

1. **Add `USE_EXACT_ALARM` to all four module manifests** (shuffle, context-mood,
   sleep-wake, friend-checkin). It is **auto-granted on Android 13+** (zero user
   steps), so `canScheduleExactAlarms()` returns true and every re-arm takes the
   `setExactAndAllowWhileIdle` path — firing to the minute even in Doze. This is
   the single fix for bugs 1, 2, and 4.

2. **Make friend check-in deliver the prompt natively when JS is dead.** On each
   alarm fire the service now branches: if the JS module instance is alive →
   `emitTick()` (unchanged rich 7-button prompt + offline apply); if it's null
   (headless cold-start) → post the prompt natively on a new HIGH-importance
   channel, with a content tap that opens the app to pick a mood. No duplicate
   notifications (only one path runs per fire). Fixes bug 3.

## Files changed

- `modules/shuffle-foreground/android/src/main/AndroidManifest.xml` — add `USE_EXACT_ALARM`.
- `modules/context-mood-foreground/android/src/main/AndroidManifest.xml` — add `USE_EXACT_ALARM`.
- `modules/sleep-wake-foreground/android/src/main/AndroidManifest.xml` — add `USE_EXACT_ALARM`.
- `modules/friend-checkin-foreground/android/src/main/AndroidManifest.xml` — add `USE_EXACT_ALARM`.
- `modules/friend-checkin-foreground/android/src/main/java/.../FriendCheckinForegroundService.kt` —
  HIGH-importance prompt channel; native `postPromptNotification()` (with opener
  rotation) on the JS-dead fire path.

## Verification

- `npx tsc --noEmit` → exit 0 (no new errors; changes are XML + Kotlin, so this
  only confirms no JS regression).
- `npm test` → 13 suites, 203 tests, all pass.
- Native compile + on-device behaviour: **requires a release-APK rebuild on a
  connected device** (Kotlin/manifest changes don't reach the device via Metro).
  Manual on-device checks to run after the rebuild:
  - Settings → confirm "Alarms & reminders" shows as allowed for the app
    (USE_EXACT_ALARM auto-grant).
  - Sleep/Wake: set wake hour to the next minute boundary, lock the phone, confirm
    it fires on time (not ~1 h late).
  - Mood/shuffle: set a short interval, lock the phone, confirm changes keep
    coming on cadence.
  - Friend check-in: enable, force-stop the app (kill JS), wait one interval,
    confirm the prompt notification still arrives.

## Notes

- **Play-policy:** `USE_EXACT_ALARM` is restricted by Google Play to alarm/clock/
  calendar-style apps. This was an explicit product decision (chosen over the
  prompt-only approach) for maximum reliability; fine for sideload/test
  distribution, revisit if publishing to the Play Store.
- The existing battery-optimization / autostart prompt (`maybePromptBackgroundAccess`)
  is still needed and unchanged — exact alarms fix Doze deferral, but aggressive
  OEM killers (Vivo/MIUI/ColorOS) are a separate gate the user must still allow.
- The friend check-in Android floor (15 min) is intentionally kept; a "1 min"
  request maps up to it. Doze rate-limits allow-while-idle alarms anyway, and
  sub-15-min wallpaper/mood pings are spammy.
