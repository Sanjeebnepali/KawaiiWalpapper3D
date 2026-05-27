# 176 — Mood "footstep" + Sleep/Wake actually change the wallpaper while the app is closed

**Date:** 2026-05-27
**Type:** fix (native + JS)

## Problem

User: the Mood-Based "footstep" (auto-change in background) wallpaper "doesn't
change properly, auto detection doesn't work — it sometimes works but I need to
visit the app for the change," and "same for Sleep/Wake — I need to visit the
app at that time, otherwise it doesn't work." Both features only applied when
the app was opened. Shipping blocker.

## Root cause (three distinct defects)

1. **Footstep / context-mood delegated the whole apply to JS.** Each alarm tick,
   `ContextMoodForegroundService` only called `Module.instance?.emitTick()` to
   bounce the work back to JS (`runMoodBackgroundOnce`). When the app process is
   dead — the normal state once the app's been closed a while, and the default
   on Vivo/MIUI/ColorOS — `instance` is null, so the tick applied *nothing*. The
   wallpaper changed only while the JS runtime was alive. (change 168's own
   "honest limits" note already flagged this gap.)

2. **Sleep/Wake images were cached in the OS-evictable dir.** The wake/sleep
   wallpapers were pre-downloaded into `FileSystem.cacheDirectory`
   (Android `cacheDir`). At the scheduled hour — often many hours after the app
   was last open — the OS/aggressive OEM had evicted the file, so
   `SleepWakeForegroundService.applySlot` hit `!File(path).exists()` and silently
   applied nothing (then re-armed). Opening the app re-downloaded it → "works
   when I visit."

3. **Both services disarmed themselves on `onDestroy`, and the boot receivers
   were missing.** `onDestroy` cancelled the alarm AND wiped the persisted
   config. A low-memory / OEM kill that runs `onDestroy` therefore destroyed the
   exact state the AlarmManager / START_STICKY / boot resurrection needs to
   resume. And the `*BootReceiver` files (change 082) were lost when the modules
   were recreated in change 138 — only `*AlarmReceiver` survived — so a reboot
   left everything dead until the app was reopened (`KNOWN_ISSUES.md` still
   claimed these existed).

## Solution

**1. Context-mood applies natively (mirrors the proven Sleep/Wake + Shuffle
pattern).** JS pre-resolves the active Mood Collection into a
`{ moodUris: { <mood>: [file://…] }, all: [file://…] }` payload (downloaded to
the PERSISTENT dir) and hands it to the service. On each tick the service now:
computes the mood from the time of day (Kotlin port of `inferContextMood`'s
hour→mood bands), picks a URI from that mood's bucket (rotating, falling back to
`all`), and calls `WallpaperManager.setBitmap` itself — no live JS needed. It
still emits `onTick`; the JS listener now only mirrors the mood into history
(`recordBackgroundMoodTick`) when alive, never re-applies (no double-set).

**2. Scheduled wallpapers persist.** New `downloadToPersistent` (factored out of
`downloadToCache` via a shared `downloadInto(baseDir, …)`) writes to
`documentDirectory`, which survives until uninstall. Sleep/Wake precache + the
context-mood resolver both use it.

**3. Survive kills + reboots.** `onDestroy` no longer cancels the alarm or wipes
config — that now happens only on an explicit `stop()` (a new companion
`tearDown(context)` called from the JS module). Re-added `ContextMoodBootReceiver`
+ `SleepWakeBootReceiver` (+ `RECEIVE_BOOT_COMPLETED`) that restart the service
after a reboot when persisted config is present.

## Files changed

**JS**
- `lib/wallpaperActions.download.ts` — factor `downloadInto(baseDir,…)`; add
  `downloadToPersistent` (documentDirectory).
- `lib/wallpaperActions.ts` — re-export `downloadToPersistent`.
- `lib/sleepWakeForeground.ts` — precache via `downloadToPersistent`.
- `lib/contextMoodForeground.ts` (new) — resolve active Mood Collection →
  mood→uris payload (persistent dir), start the native service.
- `lib/moodBackgroundTask.ts` — `recordBackgroundMoodTick()` (history-only, no apply).
- `lib/moodBootstrap.ts` — start via the resolver; context tick listener records
  only; re-resolve + restart on Mood Collection change; drop the now-unused
  `precacheMoodCollection`.
- `modules/context-mood-foreground/index.ts` — `start(intervalMinutes, payloadJson)`.

**Native — context-mood**
- `ContextMoodForegroundService.kt` — native apply (mood-by-hour + pick + setBitmap
  + screen-fit); persist payload; `onDestroy` no longer tears down; companion
  `firePendingIntent` / `tearDown`.
- `ContextMoodForegroundModule.kt` — new `start` signature; `stop()` → `tearDown` + stopService.
- `ContextMoodBootReceiver.kt` (new) + manifest: `SET_WALLPAPER`,
  `RECEIVE_BOOT_COMPLETED`, boot `<receiver>`.

**Native — sleep-wake**
- `SleepWakeForegroundService.kt` — `onDestroy` no longer cancels/clears; companion
  `tearDown`; `PREFS` made public for the boot receiver.
- `SleepWakeForegroundModule.kt` — `stop()` → `tearDown` + stopService.
- `SleepWakeBootReceiver.kt` (new) + manifest: `RECEIVE_BOOT_COMPLETED`, boot `<receiver>`.

## Verification

- `npx tsc --noEmit` → exit 0, no errors.
- `npm test` → 13 suites, 203 tests pass.
- `npx expo run:android --variant release --no-bundler` → built + installed on
  device (10BD3J019Y00073). On-device background behaviour observed after install.

## Notes / honest limits

- **"Footstep" on Android is still time-of-day, not real step sensing.**
  `expo-sensors`' historical-step API is iOS-only (`lib/stepCount.ts`). This
  change makes the time-based mood APPLY reliably with the app closed; it does
  not add walking detection (the user chose "reliable time-of-day" over adding a
  native step sensor — that remains a possible follow-up).
- OEM **Force-stop** (Settings → Apps → Force stop) still wins — Android refuses
  to restart any service of a user-stopped package. And a powered-OFF phone runs
  nothing. Battery-whitelisting (the existing `maybePromptBackgroundAccess`
  nudge) is still required on Vivo/MIUI/ColorOS.
- `KNOWN_ISSUES.md` boot-receiver claims (change 082) are accurate again.
- NATIVE REBUILD required (Kotlin + manifest changes).
