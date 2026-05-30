# Change 188: Make exact-alarm grant Play-safe (drop USE_EXACT_ALARM, add a one-tap prompt)

## Problem

Change 187 fixed the "timed wallpaper changes fire late / appear stopped" bugs by
adding `USE_EXACT_ALARM` to the four foreground-module manifests. That permission is
**auto-granted on Android 13+**, which made exact alarms work with zero user steps —
but `USE_EXACT_ALARM` is on **Google Play's restricted-permissions list**: Play only
allows it for apps whose core purpose is an alarm clock, timer, or calendar. A
wallpaper app does not qualify, so shipping it risks the Play **release being
rejected** or the app being **pulled in a later policy sweep**. The Play release is
imminent, so this needed to be Play-safe before submission.

## Solution

Switch to the permission Google explicitly recommends for non-alarm apps:
`SCHEDULE_EXACT_ALARM` (which the manifests already declared) — but actually drive
the user to grant it, which change 187 never did.

1. **Removed `USE_EXACT_ALARM`** from all four module manifests (shuffle,
   context-mood, sleep-wake, friend-checkin). `SCHEDULE_EXACT_ALARM` remains.

2. **Added a one-time in-app "Alarms & reminders" prompt.** New
   `maybePromptExactAlarm()` in `lib/backgroundAccess.ts` mirrors the existing
   battery-optimization prompt's gating: it fires at most once per session, once per
   install (new persisted `exactAlarmPrompted` flag in `store/settings.ts`), only
   when `canScheduleSleepWakeExact()` reports exact alarms are NOT yet grantable
   (i.e. Android 12+ without the grant), and no-ops on iOS. Tapping "Allow" opens the
   system "Alarms & reminders" screen via the already-existing
   `openExactAlarmSettings()` helper.

3. **Chained the two prompts so they never stack.** `maybePromptBackgroundAccess()`
   now calls `maybePromptExactAlarm()` in its early-return branches (battery already
   handled in a prior session, or already battery-whitelisted). So the battery prompt
   and the exact-alarm prompt land in *different* sessions, and all four existing
   call sites pick up the exact-alarm prompt automatically — no call-site edits.

### Reliability outcome

- User grants "Alarms & reminders" → `canScheduleExactAlarms()` is true → every
  service takes the `setExactAndAllowWhileIdle` path → fires to the minute even in
  Doze. **Identical reliability to `USE_EXACT_ALARM`.**
- User declines → falls back to `setAndAllowWhileIdle` (a few minutes to ~1 h late),
  with the battery-optimization exemption still helping. Degraded but functional.

## Files changed

- `modules/shuffle-foreground/android/src/main/AndroidManifest.xml` — remove `USE_EXACT_ALARM`.
- `modules/context-mood-foreground/android/src/main/AndroidManifest.xml` — remove `USE_EXACT_ALARM`.
- `modules/sleep-wake-foreground/android/src/main/AndroidManifest.xml` — remove `USE_EXACT_ALARM`.
- `modules/friend-checkin-foreground/android/src/main/AndroidManifest.xml` — remove `USE_EXACT_ALARM`.
- `store/settings.ts` — add persisted `exactAlarmPrompted` flag (+ default).
- `lib/backgroundAccess.ts` — import `canScheduleSleepWakeExact`; add
  `maybePromptExactAlarm()`; chain it from `maybePromptBackgroundAccess()`.

## Verification

- `npx tsc --noEmit` → exit 0 (no new errors).
- `npm test` → 13 suites, 203 tests, all pass.
- Native-affecting (manifest) + JS — **needs an on-device release rebuild** to verify:
  - Fresh install on Android 13/14: enable a background feature, accept the battery
    prompt; on a later launch confirm the "Make timed changes exact" prompt appears
    and "Allow" opens the Alarms & reminders screen.
  - After granting, confirm sleep/wake fires on the exact minute.
  - Confirm the app installs/updates on Play without a restricted-permission flag
    (no `USE_EXACT_ALARM` in the merged manifest).

## Notes

- This supersedes the manifest half of change 187. The native friend-checkin
  notification fix from 187 is unaffected and stays.
- `SCHEDULE_EXACT_ALARM` is still declared and still appears in the Play data-safety
  surface, but it is NOT a restricted permission — it's the sanctioned path for
  non-alarm apps that need occasional exact timing.
