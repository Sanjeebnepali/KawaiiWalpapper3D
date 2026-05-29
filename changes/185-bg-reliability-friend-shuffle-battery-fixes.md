# Pre-publish background-reliability audit + P0 fixes (friend / shuffle / battery)

**Date:** 2026-05-30
**Type:** fix

## Problem

A pre-publish audit of every background feature (shuffle, mood, couple, friend
check-in) asked the central question: *does each feature keep working when the
app is swiped from recents, the screen is off (Doze), and after a reboot?*
(A genuinely powered-OFF phone runs nothing on any OS — that's physics, not a
bug; the solvable cases are app-kill / Doze / reboot.)

Sleep/Wake and Mood-based came back clean (AlarmManager exact alarms, boot
receivers, native apply). Three **shipping blockers** were found:

1. **Friend check-in self-destructs on any kill.** `FriendCheckinForegroundService.onDestroy`
   cancelled its own alarm AND wiped the persisted interval. Because OEM /
   low-memory kills run `onDestroy`, the feature was permanently disarmed with
   no alarm and no boot receiver to bring it back — it never recovered until the
   user re-toggled it.
2. **Friend check-in + shuffle had no boot receiver**, so both stayed dead after
   a reboot until the app was reopened.
3. **Shuffle had regressed to `Handler.postDelayed`** (change 138 recreated the
   module from its JS contract and reverted the change-081 AlarmManager design).
   `postDelayed` runs off `uptimeMillis`, which pauses in Doze — shuffle froze
   with the screen off and jumped in a burst on unlock, and drifted late.
4. **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` was declared in no manifest**, yet
   `lib/backgroundAccess.ts` fires the one-tap "don't optimise battery" system
   dialog expecting it — the single biggest lever against OEM background-freezing
   silently degraded to the long settings-list path.

`KNOWN_ISSUES.md` still claimed (from change 082) that all three services had
AlarmManager + boot receivers — false for shuffle and friend after 138.

## Solution

Ported the proven Sleep/Wake pattern (already correct) to friend check-in and
shuffle:

- **Non-destructive `onDestroy`** — it now only sets `isRunning = false`. An
  explicit JS `stop()` is the *only* path that tears down, via a new companion
  `tearDown(context)` (cancels the alarm + clears prefs). So an OEM kill leaves
  the alarm + persisted config intact and the service is resurrectable.
- **Boot receivers** — new `FriendCheckinBootReceiver` and `ShuffleBootReceiver`
  (static, manifest-declared, `BOOT_COMPLETED` + `QUICKBOOT_POWERON`) re-arm from
  persisted config after a reboot with no app open.
- **Shuffle → AlarmManager** — replaced the `Handler.postDelayed` loop with
  `AlarmManager.setExactAndAllowWhileIdle` (Doze-proof; falls back to
  `setAndAllowWhileIdle`, then a `SecurityException` catch) + a new static
  `ShuffleAlarmReceiver` that re-launches the service with `EXTRA_FIRE` to rotate
  and re-arm. The instant-first-change (change 164) and the no-re-flash-on-OS/boot
  restart behaviours are preserved in the new `onStartCommand` branching
  (fire → rotate, fresh start → apply current index, sticky/boot restart → arm only).
- **Battery permission** — added `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` to the
  shuffle module manifest (where `backgroundAccess.ts`'s comment says it lives),
  plus shuffle's `SCHEDULE_EXACT_ALARM` + `RECEIVE_BOOT_COMPLETED`.
- **Diagnosability** — shuffle's previously-silent apply-failure catch now logs
  `Log.w(TAG=ShuffleFG, …)` so a blocked background apply is visible in logcat.
- Updated `KNOWN_ISSUES.md` with a dated correction documenting the 138
  regression → 185 restoration and the correct receiver class names.

Why this approach: it is a near-mechanical port of code that already works in two
sibling modules (Sleep/Wake, Context-Mood), so it carries the lowest risk and
keeps all four FGS modules on one consistent, reviewable pattern.

## Files changed

- `modules/friend-checkin-foreground/.../FriendCheckinForegroundService.kt` — non-destructive `onDestroy`; companion `tearDown()`; `PREFS_NAME`/`KEY_INTERVAL_MINUTES` made public for the boot receiver; removed instance `cancelAlarm()`.
- `modules/friend-checkin-foreground/.../FriendCheckinForegroundModule.kt` — `stop()` calls `tearDown()` first; refreshed stale `Handler.postDelayed` doc comments.
- `modules/friend-checkin-foreground/.../FriendCheckinBootReceiver.kt` — **new** boot receiver.
- `modules/friend-checkin-foreground/.../AndroidManifest.xml` — `RECEIVE_BOOT_COMPLETED` + `<receiver>`.
- `modules/shuffle-foreground/.../ShuffleForegroundService.kt` — AlarmManager scheduling (`scheduleNext`/`firePendingIntent`); fire/fresh/restart branching; non-destructive `onDestroy`; companion `tearDown()` + `EXTRA_FIRE`/`ACTION_FIRE`/`REQ_FIRE`/`TAG`; `KEY_URIS` made public; `Log.w` on apply failure; dropped `Handler`/`Looper`.
- `modules/shuffle-foreground/.../ShuffleAlarmReceiver.kt` — **new** alarm receiver.
- `modules/shuffle-foreground/.../ShuffleBootReceiver.kt` — **new** boot receiver.
- `modules/shuffle-foreground/.../ShuffleForegroundModule.kt` — `stop()` calls `tearDown()`; comment fix.
- `modules/shuffle-foreground/.../AndroidManifest.xml` — `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` + both `<receiver>`s.
- `KNOWN_ISSUES.md` — dated correction block (138 regression → 185 restoration), correct receiver names.

## Verification

- Two release rebuilds on device `10BD3J019Y00073` (the second covers shuffle + battery):
  - friend-checkin: `BUILD SUCCESSFUL in 4m 6s`, APK installed.
  - shuffle + battery: `BUILD SUCCESSFUL in 7m 21s`, APK installed. (An interim
    run hit a Windows `mergeDexRelease` file-lock flake — environmental, not code;
    resolved by stopping a stray Gradle daemon and rebuilding from the project root.)
- Merged release manifest (`merged_manifests/release/.../AndroidManifest.xml`) confirmed to contain `ShuffleBootReceiver`, `ShuffleAlarmReceiver`, `FriendCheckinBootReceiver`, `FriendCheckinAlarmReceiver`, `SCHEDULE_EXACT_ALARM`, `RECEIVE_BOOT_COMPLETED`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`.
- `npm test` — 13 suites, 203 tests pass (no JS regression; changes are native-only).

## Notes

- Static analysis + build verification only. The Doze/kill/reboot *behaviour*
  follows from the Android `uptimeMillis` vs. `setExactAndAllowWhileIdle`
  semantics and matches the working Sleep/Wake module; on-device confirmation of
  the OEM-kill / reboot resurrection would need a manual device test (whitelist
  the app, toggle shuffle/friend on, reboot, confirm the wallpaper still rotates
  / the prompt still fires with the app closed).
- Force-stop (Settings → Force stop) and a powered-OFF phone remain unsolvable
  for any app — out of scope by definition.
- P1 follow-ups noted by the audit but NOT in this change: couple-feature reboot
  resume + calling `maybePromptBackgroundAccess()` from the couple flow; the
  Mood screen UI copy that says "step count" on Android (it is purely time-driven
  — step count is never read on Android); the one-shot `bgAccessPrompted` gate
  that under-nags relative to its documented "re-offer next session" intent.
