# 168 — Friend check-in & context-mood FGS fire on time in Doze (AlarmManager)

## Problem

User: "when mobile is turn off i think footstep as well as friend check message
get turn off … it feels delay." With the screen off, friend check-in prompts
and the auto-detect ("footstep"/context) mood updates arrived late or in a
burst on unlock, instead of on their set cadence.

## Root cause

Both `FriendCheckinForegroundService` and `ContextMoodForegroundService` drove
their periodic tick with **`Handler.postDelayed`**. `postDelayed` runs off
`SystemClock.uptimeMillis()`, whose clock **PAUSES while the CPU sleeps in
Doze** (screen off, device idle). So the tick didn't fire until the device woke
— the prompts/inference stalled and then caught up at once on unlock.

This is the exact bug change 162 already fixed for `SleepWakeForegroundService`
(moved to `AlarmManager.setExactAndAllowWhileIdle`). The friend + context
services were recreated in change 138 and never got that treatment — verified by
reading both `.kt` files (`handler.postDelayed(this, intervalMs)`).

## Solution

Applied the proven Sleep/Wake pattern to both services:

- Replaced the `Handler.postDelayed` loop with `scheduleNext()` →
  `AlarmManager.setExactAndAllowWhileIdle(RTC_WAKEUP, now + interval, pi)`,
  falling back to `setAndAllowWhileIdle` when exact alarms aren't permitted
  (Android 12+) or a `SecurityException` is thrown. RTC_WAKEUP fires at the real
  wall-clock time even in Doze.
- New static `FriendCheckinAlarmReceiver` / `ContextMoodAlarmReceiver` receive
  the alarm and re-launch their service with `EXTRA_FIRE`; `onStartCommand`
  emits the JS tick (`Module.instance?.emitTick()`) and re-arms the next alarm.
  Static (manifest-declared) so the alarm is deliverable even after the process
  is killed; the exact-alarm fire grants a short power allowlist so starting the
  FGS from the receiver is allowed on Android 12+.
- Each module manifest gains `SCHEDULE_EXACT_ALARM` (auto-granted on 12/13,
  user-grantable on 14+; degrades to `setAndAllowWhileIdle`, so not
  load-bearing) and the `<receiver>` declaration.

START_STICKY + the SharedPreferences-persisted interval are unchanged, so an
OS/OEM-killed service still resumes. The JS layer (`lib/moodBootstrap.ts`
tick listeners + `start/stop`) is untouched — same `emitTick` → JS contract.

## Files changed

- `modules/friend-checkin-foreground/android/.../FriendCheckinForegroundService.kt`
  — Handler→AlarmManager rewrite.
- `modules/friend-checkin-foreground/android/.../FriendCheckinAlarmReceiver.kt` (new).
- `modules/friend-checkin-foreground/android/src/main/AndroidManifest.xml`
  — add `SCHEDULE_EXACT_ALARM` + receiver.
- `modules/context-mood-foreground/android/.../ContextMoodForegroundService.kt`
  — same rewrite.
- `modules/context-mood-foreground/android/.../ContextMoodAlarmReceiver.kt` (new).
- `modules/context-mood-foreground/android/src/main/AndroidManifest.xml`
  — add `SCHEDULE_EXACT_ALARM` + receiver.

## Verification

- Native release build (`npx expo run:android --variant release --no-bundler`)
  — compiles the new Kotlin + merged manifests and installs on the device.
- Pattern is identical to the already-shipped, device-verified Sleep/Wake fix
  (changes/162, re-verified in 165's black-box pass).

## Notes / honest limits

- **"Footstep" on Android isn't real step detection.** `lib/stepCount.ts`
  returns `null` / `'unsupported'` on Android — `expo-sensors`'
  `getStepCountAsync` is iOS-only and throws on Android, so the auto-detect mood
  is driven by **time-of-day**, not walking. This fix makes that time-based
  inference fire on schedule with the screen off; it does NOT add step sensing.
  Real step-based mood would need a native step-counter sensor in the FGS
  (separate, larger change).
- The tick still calls back into JS (`emitTick`) to do the work (fire the prompt
  / run inference), which needs the process alive. The FGS keeps it alive in the
  common case; if an aggressive OEM kills the whole process, the system-held
  alarm restarts the *service* but JS may be down, so that one tick is lost
  (re-arm continues). Battery-whitelisting (the `maybePromptBackgroundAccess`
  nudge) is still required on Vivo/MIUI/ColorOS. A fully JS-independent path
  (post the friend notification natively on tick) is a possible follow-up.
- NATIVE REBUILD required (Kotlin + manifest changes).
