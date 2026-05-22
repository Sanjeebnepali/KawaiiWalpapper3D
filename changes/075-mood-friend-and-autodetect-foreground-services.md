# Mood: friend check-in + auto-detect on native foreground services (sub-15-min reliable, no Doze coalescing)

**Date:** 2026-05-19
**Type:** fix

## Problem

Two related complaints about the Mood feature both rooted in the same
Android OS plumbing limitation:

1. **Friend check-in only fires when I open the app.** User set the
   interval to 1 minute. After 3–4 minutes of the phone sitting locked,
   they unlocked it and got 3–4 notifications in a burst. From their
   perspective, the friend prompt was "only working when I'm in the
   app." (changes/057 had introduced a 30-fire chain for sub-15-min
   intervals to bypass WorkManager's 15-min periodic floor — those
   fires were scheduled, but…)
2. **Auto mood detection (context background) doesn't happen until I
   open the app either.** The UI said "30 min to 1 hour" but the user
   only ever saw a context-mood entry in their history after
   foregrounding the app. The bg-task was registered correctly with
   `expo-background-fetch` but the WorkManager job was being dropped.

Same root cause for both: **the OS APIs we were using don't run on
time when the app is closed**.

- `expo-notifications` `TIME_INTERVAL` triggers on Android route through
  inexact `AlarmManager.setAndAllowWhileIdle`. In Doze / app-standby /
  OEM battery optimisers (Vivo OriginOS, MIUI, ColorOS, OneUI, HyperOS)
  the OS **coalesces** queued alarms into the next maintenance window
  and **releases them in a burst** when the device exits Doze — which
  typically happens when the user unlocks the phone. The 30-fire chain
  from changes/057 was scheduled correctly; the OS just held the fires
  and let them out at once.
- `expo-background-fetch` is backed by Android `WorkManager` periodic
  work. The 15-min `minimumInterval` is a floor, not a contract. On
  stock Android Doze stretches it to "every several hours." On OEM
  ROMs (Vivo / MIUI / Oppo / Huawei) WorkManager periodic work is
  silently dropped entirely unless the app is whitelisted by the user.

Sleep/Wake mode does not have this problem because changes/057 + 055
already moved it to a native foreground service. We just needed to
do the same for the other two timed mood features.

## Solution

### Two new Android foreground service modules

Mirroring the existing `modules/sleep-wake-foreground/` pattern (which
mirrors `modules/shuffle-foreground/` before it):

- `modules/friend-checkin-foreground/`
- `modules/context-mood-foreground/`

Both follow the same architecture:

- A Kotlin `Service` with a `Handler.postDelayed` loop on the user's
  interval. Running in the foreground with a low-priority ongoing
  notification (Android 8+ contract) which exempts the service from
  Doze / app-standby / OEM background killers.
- `foregroundServiceType="specialUse"` + `FOREGROUND_SERVICE_SPECIAL_USE`
  permission + the documented Play Store subtype property. No
  predefined type (mediaPlayback, location, camera) fits "tick on
  user-set interval to fire a mood prompt or run an inference."
- `START_STICKY` + `SharedPreferences`-persisted params so a rare OS
  kill restarts the service with the same interval.
- An Expo Module (`Events("onTick")`) that emits a JS event from
  inside each tick. JS handlers do the actual work — see below.

The native services do NOT do the work themselves (unlike Sleep/Wake,
which writes the wallpaper natively). Reason: the JS-side
`fireMoodPromptNotification()` already owns the 7-emoji notification
category, the deduped tap-handling via
`addNotificationResponseReceivedListener`, the mood store integration,
and the photo-pool resolution. Replicating any of that in Kotlin
would duplicate hundreds of lines for no functional gain. The FGS
only needs to **keep the process alive** and **tick on time** —
which is the part Android was breaking; JS does everything else.

### JS-side wiring (lib/moodBootstrap.ts)

Once-per-process tick listeners installed inside `bootstrapMoodFeature`:

- Friend tick → `fireMoodPromptNotification()` (existing path, used
  by the "usage-monitor" source for years).
- Context tick → `runMoodBackgroundOnce()` (existing path; runs
  shuffle, sleep/wake fallback, AND context-mood inference, each
  gated by its own store flag and de-duped by its own day-stamp).

Listeners gate on the live store flag — if the user disabled the
feature between the service arming its Handler and the tick firing,
the listener no-ops so we never leak a stale prompt.

Start/stop branching:

- `friendCheckInEnabled` flips on → if FGS available, start it +
  cancel any expo-notifications schedule (so we don't double-notify).
  If not (iOS / pre-rebuild), schedule via `expo-notifications` as
  before.
- `friendCheckInMinutes` changes while enabled → restart the FGS
  (`ACTION_START` re-arms the Handler with the new interval).
- `friendCheckInEnabled` flips off → stop FGS + cancel any leftover
  expo-notifications schedule.
- `backgroundEnabled` flips on → keep registering bg-fetch (belt +
  braces fallback for iOS / FGS-death edge case) AND start the
  context-mood FGS. Off → stop both.

### UI copy update (app/(tabs)/mood.tsx)

- "OS-decided cadence (typically 30 min – few hours) · time of day +
  step count" → **"Runs every ~30 min · time of day + step count"**
- "Background cadence is set by the OS for battery — usually 30 min
  to a few hours." → **"Runs reliably every ~30 min. On Vivo / Xiaomi
  / Oppo, allow 'Autostart' for this app in your phone's battery
  settings."** (kept as a hint for the OEM edge case where even FGSes
  can be killed unless whitelisted)
- "Background mood on — runs every 30–60 min" → **"Background mood on
   — runs every 30 min"**
- Sub-15-min friend toast: only warns about Android round-up when the
  FGS isn't available (iOS / pre-rebuild). With FGS the warning is
  wrong — sub-15-min fires on time now.

### Why we kept expo-background-fetch + the iOS expo-notifications path

Belt + braces. The FGS is Android-only:

- iOS doesn't permit a continuous wallpaper-rotation foreground service
  but `expo-notifications` local scheduling is already reliable on iOS
  (Apple's local notification scheduler doesn't have the Android Doze
  problem). The iOS path remains the friend check-in implementation.
- On Android, `expo-background-fetch` covers the rare case where the
  OEM kills even the FGS — when it eventually fires, the dedup checks
  inside `runMoodBackgroundOnce` (`lastBgMood`, `sleepWakeLastWakeDay`)
  prevent re-application of work already done by the FGS.

## Files changed

- `modules/friend-checkin-foreground/` (new):
  - `package.json`, `expo-module.config.json`
  - `index.ts` — JS bridge with `start`/`stop`/`addFriendCheckinTickListener`/`isAvailable`/`isRunning`
  - `android/build.gradle`
  - `android/src/main/AndroidManifest.xml` — service declaration +
    FGS_SPECIAL_USE permission + Play Store subtype property
  - `android/src/main/java/.../FriendCheckinForegroundModule.kt` —
    `Events("onTick")` + `start(intervalMin: Int)` + `stop` + `isRunning`
  - `android/src/main/java/.../FriendCheckinForegroundService.kt` —
    `Handler.postDelayed` loop, `tickCallback` static slot, SharedPreferences
    persistence, `START_STICKY` restart, low-priority ongoing notification
- `modules/context-mood-foreground/` (new):
  - Same set as above, with `ContextMood` naming + default interval
    `30 min` (5–1440 range) + different ongoing-notification copy.
- `lib/moodBootstrap.ts`:
  - New imports for both module bridges + `runMoodBackgroundOnce` +
    `fireMoodPromptNotification`.
  - New `CONTEXT_MOOD_FGS_INTERVAL_MIN = 30` constant.
  - Tick listeners installed once per process inside
    `bootstrapMoodFeature` (step 2a).
  - Friend check-in branch in bootstrap step 3 + in the subscriber:
    FGS-available → start FGS + cancel expo-notifications schedule.
    FGS-unavailable (iOS) → keep the old `scheduleFriendCheckInNotification`
    path. Toggling off cancels both belt-and-braces.
  - Context-mood branch in bootstrap step 3 + in the subscriber:
    start/stop the FGS alongside the existing bg-fetch registration.
- `app/(tabs)/mood.tsx`:
  - Import `isFriendCheckinForegroundAvailable`.
  - Auto-detect card copy: "OS-decided cadence" → "Runs every ~30 min".
  - Privacy footer: rewrites the "30 min to a few hours" disclaimer
    into an OEM autostart hint.
  - Friend custom-interval toast only warns about Android round-up
    when the FGS isn't available.
  - Background-on toast: "30–60 min" → "30 min".
- `package.json`:
  - **Critical for autolinking** (per the lesson learned in changes/052
    + 073): added `"context-mood-foreground": "file:./modules/context-mood-foreground"`
    and `"friend-checkin-foreground": "file:./modules/friend-checkin-foreground"`
    to `dependencies` so Expo Modules autolinking discovers them
    during `npm install --legacy-peer-deps`. Without this, the Kotlin
    sources never get compiled into the APK and the runtime
    `requireOptionalNativeModule('FriendCheckinForeground')` silently
    returns null — exactly the failure mode that took half a debug
    session in change 052.
- `changes/README.md` — index row (added separately).

## Verification

This change adds NEW native code (two Expo modules with Kotlin
sources + AndroidManifest service declarations), so a full native
rebuild is required:

```powershell
npm install --legacy-peer-deps
npx expo run:android --variant release --no-bundler
```

Or use the `run` shortcut per `CLAUDE.md`. The Metro-only reload path
won't pick up the new modules.

On device, after the build installs:

1. **Friend check-in at 1 min:**
   - Mood → Friend check-in on → set interval to `1` (custom).
   - Toast: `✓ Set to 1 min` (no more "Android may round up to 15"
     warning when FGS is linked).
   - In the Android notification shade you should see a low-priority
     ongoing notification: "Kawaii Baby — Friend check-in · Mood
     check-ins every 1 min".
   - **Lock the phone for 5 minutes.** When you unlock, the count of
     friend prompts in your shade should be approximately 5 (one per
     minute that elapsed), not 0 then a sudden burst of all 5.
   - Open the app and check the mood history — only entries from
     prompts the user actually tapped should show; the listener
     no-ops if `friendCheckInEnabled` is false at tick time.
   - **Old bug:** notifications batched and only flushed on unlock.

2. **Auto mood detection (background):**
   - Mood → Auto-change in background on (pool selected).
   - Toast: `✓ Background mood on — runs every 30 min`.
   - Notification shade: ongoing "Kawaii Baby — Auto mood detection
     · Auto-detecting mood every 30 min".
   - Set wake/sleep mode OFF and start a 35-min phone-locked timer.
     When you unlock, the mood history's most recent entry should
     have a `'background'` source within the past few minutes.
   - **Old bug:** no background entries ever appeared until the user
     foregrounded the app.

3. **Toggle-off sanity:**
   - Turn each feature off — the matching ongoing notification should
     disappear from the shade within ~1 second.
   - Toggle on then off rapidly — no stuck notifications.

4. **OEM autostart caveat (informational):**
   - On Vivo / Xiaomi / Oppo, the user may need to enable "Autostart"
     for Kawaii Baby in the OEM battery settings for the FGS to
     survive a reboot. The new privacy hint in the auto-detect card
     points to this.

## Notes

- **Native rebuild required.** Adding new Expo modules with Kotlin
  sources changes Gradle inputs; a JS reload (Metro `--clear`) won't
  pick them up. The `r` Expo CLI shortcut won't do it either — must
  be a full `expo run:android` (or the `run` shortcut for release).
- **JS keepalive assumption.** The hybrid (native FGS ticks → JS
  event handler) approach relies on the React Native instance staying
  alive in the app process for as long as the FGS is alive. In SDK 55
  with Expo's Application class, the React instance survives Activity
  destruction — only process death tears it down, and the FGS keeps
  the process alive. If a future Android version starts killing the
  React instance independently from the process, we'd need to migrate
  to fully-native (post notifications via NotificationManager,
  HeadlessJsTask into JS only on tap). Today this works.
- **iOS path unchanged.** The new modules are `platforms: ["android"]`
  only. On iOS `requireOptionalNativeModule` returns null and every
  helper gracefully no-ops; the existing `expo-notifications` schedule
  path drives iOS friend check-in as it did before.
- **Three ongoing notifications when all three features are on.**
  Sleep/Wake + Friend + Auto-detect each have their own FGS with its
  own low-priority sticky notification. This is the unavoidable cost
  of Android's "user explicitly asked for ongoing work" contract.
  Each notification is `PRIORITY_MIN` + `IMPORTANCE_MIN` so they
  collapse into the system shade without heads-up or sound.
- **OEM autostart settings helper is a follow-up.** Apps like Zedge
  and Sleep As Android ship an in-app screen with deep-links to
  each OEM's autostart settings. Worth doing but out of scope here —
  filed mentally.
