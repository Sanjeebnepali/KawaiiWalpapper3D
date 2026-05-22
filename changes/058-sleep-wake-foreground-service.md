# Sleep/Wake foreground service — wallpaper auto-applies with app fully closed

**Date:** 2026-05-19
**Type:** feature

## Problem

User after change 057:

> i don't understand i what i want is completely app close like user
> doesnot need to open app after setup complete

Change 057's "foreground auto-apply" only worked while the JS bundle
was alive (app foreground or recently backgrounded). Once Android
killed the process — which Vivo OriginOS does aggressively, often
within 30 sec of backgrounding — there was no path that could change
the wallpaper at wake/sleep hour without a user tap.

The existing fallbacks all have known limits on the user's device
class:

- `expo-background-fetch` (`runSleepWakeFallback` in
  `lib/moodBackgroundTask.ts`) — Vivo / MIUI / ColorOS silently drop
  it. Diagnosed via `adb shell dumpsys jobscheduler` in change 051.
- Tap-driven (`handleResponse` in `lib/moodNotifications.ts`) —
  requires a user gesture, defeats the "set and forget" ask.
- Foreground handler (change 057) — only fires while JS is alive.

The user explicitly asked for a fix that works when "user does NOT
need to open the app after setup complete." Picked the FGS approach
over `AlarmManager.setExactAndAllowWhileIdle` (which would need the
restricted `SCHEDULE_EXACT_ALARM` permission on Android 12+).

## Solution

New Expo native module `modules/sleep-wake-foreground/` that mirrors
the structure of `modules/shuffle-foreground/` (the same FGS pattern
that solved the same problem for the Shuffle timer in change 051).
Different tick model: Shuffle ticks every N min (fixed interval);
Sleep/Wake ticks at user-set hours of day.

### Native side — `SleepWakeForegroundService.kt`

`android.app.Service` extending `Service`, started via the standard
Expo Modules JS bridge:

- `onStartCommand(ACTION_START)` — stores `wakeUri`, `sleepUri`,
  `wakeHour`, `sleepHour` from the Intent extras, persists them to
  `SharedPreferences`, starts the foreground notification, computes
  ms-until-next-fire (`nextFire()`), `Handler.postDelayed(runnable,
  delayMs)`. On fire, decodes the bitmap via `BitmapFactory.decodeFile`
  and applies via `WallpaperManager.setBitmap(bitmap, null, true,
  FLAG_SYSTEM | FLAG_LOCK)`. After applying, re-arms via
  `scheduleNextTick()` for the next fire (which alternates wake →
  sleep → wake → sleep as the clock advances).
- `onStartCommand(intent == null)` — Android `START_STICKY` semantics:
  the OS killed us and is restarting the service. Read the params
  back from SharedPreferences and resume. Clean install / disabled
  state → `stopSelf()`.
- `onStartCommand(ACTION_STOP)` — cancel the runnable, clear
  SharedPreferences, `stopForeground(STOP_FOREGROUND_REMOVE)`,
  `stopSelf()`.

Notification: low-priority ongoing on channel `kawaii.sleepwake.fg`,
title "Kawaii Baby — Sleep/Wake mode", subtitle
"Wake at 7 AM · Sleep at 10 PM" (computed from the stored hours).
`PRIORITY_MIN` + `IMPORTANCE_MIN` keeps it at the bottom of the shade
with no sound / vibration / badge. Stops the moment the user
deactivates Sleep/Wake.

Same `foregroundServiceType="specialUse"` + manifest property pattern
as the Shuffle FGS; both `FOREGROUND_SERVICE` and
`FOREGROUND_SERVICE_SPECIAL_USE` permissions declared.

### Native side — `SleepWakeForegroundModule.kt`

Standard Expo Modules `ModuleDefinition` with three sync Functions:

- `start(wakeUri, sleepUri, wakeHour, sleepHour)` — fires an
  ACTION_START Intent via `startForegroundService` (Android 8+) /
  `startService`.
- `stop()` — fires ACTION_STOP via `startService` (deliberately not
  `startForegroundService` — the service self-removes after handling
  the stop intent).
- `isRunning()` — returns the static `@Volatile var running` flag.

### JS bridge — `modules/sleep-wake-foreground/index.ts`

`requireOptionalNativeModule<SleepWakeForegroundModule>('SleepWakeForeground')`
so iOS / pre-rebuild JS reloads degrade to no-ops. Exports
`startSleepWakeForeground` / `stopSleepWakeForeground` /
`isSleepWakeForegroundRunning` / `isSleepWakeForegroundAvailable`.

`startSleepWakeForeground` clamps the two hours into [0, 23] before
forwarding to native — defence in depth on top of the service's own
clamp.

### Resolver — `lib/sleepWakeForeground.ts`

The native service rotates only LOCAL `file://` URIs (decoded via
`BitmapFactory.decodeFile`), so JS pre-resolves before calling
start. New file mirrors the shape of
`startForegroundShuffleForCollection` in `lib/shuffleActions.ts`:

- `resolveSleepWakeUris(packId)`:
  - `packId === CUSTOM_SLEEP_WAKE_ID` → reads
    `sleepWakeCustomWakeId` / `sleepWakeCustomSleepId` from
    `useMoodStore`; each id is either a direct `file://` /
    `content://` URI (gallery-picked) or a catalog photo ID
    (resolved via `getPhotoById`).
  - Curated pack → `getSleepWakePack(packId)` for the two http URLs.
- `precachePair(wakeRef, sleepRef, idSeed)` — both downloaded /
  copied to cache in parallel via the already-content-uri-aware
  `downloadToCache` from change 057.
- `startSleepWakeForegroundFromStore()` — entry point used by
  bootstrap. Reads `sleepWakeEnabled` / `sleepWakePackId` /
  `sleepWakeWakeHour` / `sleepWakeSleepHour` from the mood store,
  resolves URIs, calls native start. Fire-and-forget; failures are
  silent because the bg-task + tap fallbacks above still work.

### Bootstrap wiring — `lib/moodBootstrap.ts`

Three integration points:

1. **Cold-launch start.** Inside the `sleepWakeEnabled` block that
   was already calling `scheduleSleepWakeNotifications`, append a
   fire-and-forget `void startSleepWakeForegroundFromStore()`. The
   notifications stay scheduled (the FGS is additive, not a
   replacement — it covers the closed-app gap; notifications still
   serve the user's "see it in the shade" UX).
2. **Live re-arm.** Inside the `useMoodStore.subscribe` block's
   `swInputsChanged` branch (which already re-runs
   `scheduleSleepWakeNotifications` on toggle/pack/hour change), also
   call `startSleepWakeForegroundFromStore()` so the service
   re-arms with the new params. The service's `ACTION_START` handler
   internally cancels the previous tick before scheduling the new
   one, so no race.
3. **Live stop.** In the two `else` branches that already call
   `cancelSleepWakeNotifications()` (toggle off, or custom-pair
   incomplete), also call `stopSleepWakeForeground()`.

### Autolinking — `package.json`

Added `"sleep-wake-foreground": "file:./modules/sleep-wake-foreground"`
to `dependencies`. Expo Modules autolinking picks this up during
`npm install --legacy-peer-deps` and the Android build links the
Kotlin service. Same convention as `shuffle-foreground`.

## Files changed

- `modules/sleep-wake-foreground/package.json` (new)
- `modules/sleep-wake-foreground/expo-module.config.json` (new)
- `modules/sleep-wake-foreground/index.ts` (new)
- `modules/sleep-wake-foreground/android/build.gradle` (new)
- `modules/sleep-wake-foreground/android/src/main/AndroidManifest.xml`
  (new)
- `modules/sleep-wake-foreground/android/src/main/java/expo/modules/sleepwakeforeground/SleepWakeForegroundService.kt`
  (new) — the actual FGS with time-of-day postDelayed loop +
  SharedPreferences persistence + `START_STICKY` restart resilience.
- `modules/sleep-wake-foreground/android/src/main/java/expo/modules/sleepwakeforeground/SleepWakeForegroundModule.kt`
  (new) — Expo Modules JS bridge.
- `lib/sleepWakeForeground.ts` (new) — resolver + bridge to the
  mood store.
- `lib/moodBootstrap.ts` — import + 3 wiring points (cold-launch
  start, live re-arm, live stop).
- `package.json` — autolink entry.
- `changes/README.md` — index row (added separately).

## Verification

This change requires a **native rebuild** (it adds a new Android
service + new permissions). The JS-only `npx expo start --clear`
flow won't pick up the native module — the Kotlin needs to land in
the APK.

```powershell
npm install --legacy-peer-deps
npx expo run:android
```

On the device:

1. **Happy path with curated pack:**
   - Mood → Sleep/Wake on → pick "Cosmic Dreams" (or any curated pack)
     → set Wake hour to `(current hour + 1) % 24` and Sleep hour to
     `(current hour + 2) % 24` for quick verification.
   - **Expected immediately:** ongoing notification appears in the
     shade — "Kawaii Baby — Sleep/Wake mode · Wake at … · Sleep at …".
   - Force-close the app via Recents (or `adb shell am
     force-stop com.kawaii.wallpapers`).
   - Wait until the wake hour boundary. **Expected:** wallpaper
     changes to the pack's wake image without opening the app.
   - One hour later, same thing for sleep.

2. **Happy path with custom pair:**
   - Sleep/Wake → "Pick custom pair" → choose a wake photo + sleep
     photo from the in-app gallery (or your device gallery).
   - Set hours to `now+1` / `now+2` and force-close as above.
   - **Expected:** ongoing notification still appears; wallpaper
     changes to the custom wake photo at the wake hour boundary.

3. **OEM kill resilience (Vivo / MIUI / ColorOS only):**
   - With Sleep/Wake on and force-closed, go to **Phone Manager → App
     Battery Manager** and confirm the app is set to "Allow
     background activity" (or equivalent).
   - The ongoing notification should persist even after the system
     kills our process — Android's `START_STICKY` semantics restart
     the service automatically, and the new `onStartCommand(intent ==
     null)` branch reads SharedPreferences and resumes the schedule.

4. **Toggle-off cleanup:**
   - Mood → Sleep/Wake toggle off.
   - **Expected:** ongoing notification disappears within ~1 s.
     `isSleepWakeForegroundRunning()` returns false.

5. **Pack swap re-arm:**
   - With Sleep/Wake on, switch from one pack to another.
   - **Expected:** the notification subtitle updates immediately (the
     service is restarted with the new payload); next fire uses the
     new pack's images.

## Notes

- **Doze caveat.** `Handler.postDelayed` timers are suspended during
  deep Doze and resume in the next maintenance window. For a 7am wake
  fire on a phone that entered deep Doze around 6:55am, the actual
  apply could land at 7:05–7:15am. Acceptable for "wake wallpaper around
  7" UX. If a user reports a worse drift than ~15 min, the proper fix
  is to swap the postDelayed loop for `AlarmManager.setAndAllowWhileIdle`
  with a `BroadcastReceiver` — bypasses Doze but adds reboot-resilience
  complexity. Not done in this pass because the FGS-with-postDelayed
  pattern matches the proven Shuffle FGS and is already a big enough
  delta for one rebuild.
- **Reboot survival.** Like the Shuffle FGS, this service does NOT
  auto-start after a phone reboot — the JS bootstrap (`bootstrapMood
  Feature` in `app/_layout.tsx`) starts it on first app open. So the
  user has to open the app once after rebooting their phone. A
  `BOOT_COMPLETED` broadcast receiver could close that gap; not done
  here, mirrors Shuffle behaviour.
- **Two ongoing notifications if both Shuffle and Sleep/Wake are on.**
  Both FGS modules show their own ongoing notification (Android requires
  one per service). Acceptable cost — the user explicitly opted into
  each feature. A future consolidation could merge both into a single
  multi-line notification managed by a third "kawaii.background.fg"
  service, but that's a separate refactor.
- **iOS no-op.** `requireOptionalNativeModule` returns null on iOS;
  all helpers degrade to no-ops. Apple doesn't permit programmatic
  wallpaper change anyway, so the contract has no equivalent path on
  that platform.
- **Custom-pair gallery URIs go through `downloadToCache`.** That
  helper (updated in change 057) already copies `content://` to
  `file://` via `FileSystem.copyAsync`, so a user-picked gallery photo
  is correctly resolved into a path the native `BitmapFactory.decodeFile`
  can read. Without change 057's fix this path would have silently
  failed.
- **The four user-facing layers now in priority order:**
  1. **Native FGS (new — closed-app safe).** Bypasses every OEM
     background killer we've tested. Cost: ongoing notification.
  2. Foreground handler (change 057) — fast when app is alive.
  3. `runSleepWakeFallback` in the bg-task — catch-up on app
     resume + opportunistic dispatch (OEM-dependent).
  4. Tap-driven response — manual fallback always available.
