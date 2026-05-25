# Sleep/Wake exact timing + couple restore

**Date:** 2026-05-25
**Type:** fix

## Problem

Two user-reported bugs:

1. **Sleep/Wake fired at the wrong time and "turned off after ~1 hour."** The
   user wants the swap to happen at the exact hour they pick (wake 9 → 9:00,
   sleep 12 → 12:00), and asked whether it needs internet.
2. **Couple "Restore" said "no active pairing"** for an account that was already
   paired.

## Diagnosis

1. The Sleep/Wake foreground service scheduled its next fire with
   `Handler.postDelayed`. That timer runs on `uptimeMillis`, which **pauses
   while the CPU sleeps in Doze** — so a multi-hour delay (arm at noon for a
   22:00 sleep) drifts by however long the phone was idle, firing late or at a
   random wake-up. On top of that, the Vivo (OriginOS) OEM killer stops the
   service after a while ("auto turn off after ~1 hour"), after which only the
   window-based `runSleepWakeFallback` (a ~30-min background poll that applies
   "if past the hour and not done today") runs — which is exactly the "fires at
   any time" symptom. **Internet** is only needed once, to download + cache the
   pack images; after that (or with gallery photos) the swap is fully offline.
2. Couple restore calls the `get_my_couple()` RPC; if it isn't deployed the
   client falls back to a direct query that **returns empty on the creator/host
   side** (a PostgREST+RLS quirk the RPC was written to bypass). The RPC lives
   in `supabase/couple_reconnect_v3.sql` and had not been run. (Now deployed.)

## Solution

**Sleep/Wake → exact AlarmManager (native).** Rewrote
`SleepWakeForegroundService.kt` to schedule the next {wake|sleep} at the exact
wall-clock time via **`AlarmManager.setExactAndAllowWhileIdle`** (RTC_WAKEUP),
which fires precisely even in Doze. Falls back to `setAndAllowWhileIdle` when
exact alarms aren't permitted (Android 12+ gate) or an OEM throws — still
Doze-capable, just a few minutes late, never crashes. A new manifest-declared
`SleepWakeAlarmReceiver` receives the alarm and re-launches the service to apply
that slot + re-arm the next — so even an OEM-killed service is **resurrected by
the system alarm at the exact minute** (when the app is battery-whitelisted).
Added `SCHEDULE_EXACT_ALARM` + a `canScheduleExact()` bridge method.

**Exact-alarm permission UX.** `lib/backgroundAccess.openExactAlarmSettings()`
deep-links to the Android 12+ "Alarms & reminders" screen, surfaced as a new
**"Exact alarm timing"** row in Settings → Background Access (Android).

**Couple restore.** The fix is deploying `couple_reconnect_v3.sql` (done by the
owner). Also made the failure toast actionable ("sign in with the account that
paired") and documented the RPC dependency inline.

**The other automations (audit answer).** Auto-Shuffle, Friend check-in and
Context-Mood are **interval-based** (every ~15–30 min) and already fire with the
screen off / app closed via their own foreground services — short-interval Doze
drift is tolerable there, so they do NOT need exact alarms. Camera-Mood is
foreground-only by design (the camera can't run in the background). So only the
fixed-time Sleep/Wake feature needed the exact-alarm treatment.

## Files changed

- `modules/sleep-wake-foreground/android/.../SleepWakeForegroundService.kt` — AlarmManager exact scheduling + fire-slot handling + cancel on stop (replaces Handler.postDelayed).
- `modules/sleep-wake-foreground/android/.../SleepWakeAlarmReceiver.kt` — **new** manifest receiver.
- `modules/sleep-wake-foreground/android/src/main/AndroidManifest.xml` — `SCHEDULE_EXACT_ALARM` + receiver.
- `modules/sleep-wake-foreground/android/.../SleepWakeForegroundModule.kt` — `canScheduleExact()`.
- `modules/sleep-wake-foreground/index.ts` — `canScheduleSleepWakeExact()`.
- `lib/backgroundAccess.ts` — `openExactAlarmSettings()`.
- `components/settings/LibraryAccessSections.tsx` — "Exact alarm timing" row.
- `app/couple/setup.tsx` — clearer restore-failure message.

## Verification

- `npx tsc --noEmit` → 0 errors (native Kotlin is validated at build time).
- **Needs a native rebuild** (`npx expo run:android`) to land — the sleep/wake
  module changed.
- On-device check: set wake/sleep to near-future hours; confirm the swap fires
  at the minute with the screen off. For full reliability on Vivo, the user must
  also enable **Background Access → Allow always-on + Autostart + Exact alarm
  timing**.

## Notes

- Internet is needed only for the first image precache; offline thereafter.
- On Android 14+ exact alarms may need the user grant (the new settings row);
  without it the swap is a few minutes late, not broken.
- Boot re-arm wasn't added — app-open re-arm + the existing bg-fetch
  `startOnBoot` cover a reboot; can add a BOOT_COMPLETED receiver later if needed.
