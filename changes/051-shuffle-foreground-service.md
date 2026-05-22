# Shuffle foreground service — defeats OEM background killers

**Date:** 2026-05-18
**Type:** feature

## Problem

User-reported on the latest APK:

> "The shuffle still only changes wallpaper when the app is opened.
> After change it stops the time and when I open the app then wallpaper
> applies and time restart counting but it need to be auto without open
> app forever."

Diagnosed via `adb shell dumpsys jobscheduler` — **no scheduled jobs
exist for our app**. The OEM background killer (Vivo OriginOS V2231,
also true of MIUI / ColorOS / OneUI / HyperOS) silently drops our
WorkManager periodic job — `expo-background-fetch` registers it
cleanly but Vivo's iManager refuses to dispatch it for third-party
apps. No code path on the JS side fixes this; the AppState resume
listener can only catch up when the user reopens the app.

## Solution: Android foreground service

The only OS-sanctioned contract for "continuous user-requested work"
on aggressive OEM skins is a **foreground service** with an ongoing
notification. OEMs explicitly exempt foreground services with active
notifications from their kill lists — the Vivo iManager kill rule
literally checks for `FLAG_ONGOING_EVENT` and skips the process.

### New native module: `modules/shuffle-foreground/`

```
modules/shuffle-foreground/
├── package.json
├── expo-module.config.json
├── index.ts                                            # JS bridge
└── android/
    ├── build.gradle                                     # expo-module-gradle-plugin
    └── src/main/
        ├── AndroidManifest.xml                          # FGS perms + service tag
        └── java/expo/modules/shuffleforeground/
            ├── ShuffleForegroundService.kt              # the actual service
            └── ShuffleForegroundModule.kt               # Expo Module bridge
```

`ShuffleForegroundService` extends `android.app.Service`:

- `startForeground(NOTIF_ID, notification)` with `IMPORTANCE_MIN` /
  `PRIORITY_MIN` ongoing notification. Channel `kawaii.shuffle.fg`
  with badges, lights, vibration all disabled. Title: "Kawaii Baby —
  wallpaper shuffle"; body: "Auto-rotating every N min".
- Holds a `Handler.postDelayed(tick, intervalMs)` loop on the main
  Looper. Each tick:
  - Computes the next index (sequential / random / day / smart —
    same semantics as the JS `pickNextIndex`).
  - Decodes the bitmap at `uris[index]` via `BitmapFactory`.
  - Calls `WallpaperManager.setBitmap(bitmap, null, true, FLAG_SYSTEM | FLAG_LOCK)`.
  - Recycles + schedules the next tick.
- `ACTION_STOP` cancels the runnable, removes the notification, and
  calls `stopSelf()`.
- `START_STICKY` so even if the OS kills the service for memory
  pressure, Android re-spins it with the last Intent.

AndroidManifest declares:
- `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` (Android 14+
  requires the specific subtype permission).
- `POST_NOTIFICATIONS` (Android 13+).
- `<service android:foregroundServiceType="specialUse">` with a
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` documenting the use case to the
  Play Store reviewer.

### JS bridge — `modules/shuffle-foreground/index.ts`

```ts
startShuffleForeground({ uris, intervalMs, mode, startIndex })
stopShuffleForeground()
isShuffleForegroundRunning(): boolean
isShuffleForegroundAvailable: boolean
```

iOS / pre-rebuild fallback: `requireOptionalNativeModule` returns
null → the wrappers no-op and the existing bg-fetch + AppState
resume path stays in effect.

### Pre-cache + lifecycle in `lib/shuffleActions.ts`

The service rotates LOCAL `file://` URIs (decoded via
`BitmapFactory.decodeFile`). Picsum / catalog photo URLs must be
downloaded to the app cache directory first. New
`precacheCollection(photoIds)` resolves each id through
`getPhotoById` and downloads via the existing
`downloadToCache(url, id)` (now `export`ed from
`lib/wallpaperActions.ts`). file:// / content:// ids pass through
unchanged. Failures drop silently — the service rotates whatever
made it through.

New `startForegroundShuffleForCollection(collection)`:
1. Pre-cache all `photoIds` → file:// URI list.
2. Read `intervalMs` from `getCollectionIntervalMinutes`.
3. Call `startShuffleForeground` with the resolved list +
   `mode` + the persisted `currentIndex` so rotation resumes from
   where the last session left off.

### Wired into `lib/moodBootstrap.ts`

- **Boot-time**: if a shuffle was already active when the app was
  killed, restart the service as part of bootstrap (fire-and-forget,
  parallel with the rest of the bootstrap).
- **`useShuffleStore.subscribe`**: on `activeCollectionId` flip →
  start or stop the service. On EDITS to the currently-active
  collection (timer / mode / customMinutes / photoIds changed) →
  restart the service with fresh params.

## Files changed

**New:**
- `modules/shuffle-foreground/package.json`
- `modules/shuffle-foreground/expo-module.config.json`
- `modules/shuffle-foreground/index.ts`
- `modules/shuffle-foreground/android/build.gradle`
- `modules/shuffle-foreground/android/src/main/AndroidManifest.xml`
- `modules/shuffle-foreground/android/src/main/java/expo/modules/shuffleforeground/ShuffleForegroundService.kt`
- `modules/shuffle-foreground/android/src/main/java/expo/modules/shuffleforeground/ShuffleForegroundModule.kt`

**Modified:**
- `lib/wallpaperActions.ts` — `downloadToCache` switched from `async function`
  to `export async function` so the pre-cache helper can reuse it.
- `lib/shuffleActions.ts` — `precacheCollection`,
  `startForegroundShuffleForCollection`, `stopForegroundShuffle`.
- `lib/moodBootstrap.ts` — boot-time start + shuffle-subscriber
  start/stop/restart on collection edits.

## Verification

NATIVE REBUILD required (new Kotlin module). `npx expo run:android
--variant release` from project root.

1. Open app → Theme Packs hub → Shuffle a pack → wallpaper applies.
2. Pull down the notification shade — a low-priority ongoing
   notification labelled "Kawaii Baby — wallpaper shuffle ·
   Auto-rotating every N min" should be visible. Cannot be swiped
   away (foreground-service requirement).
3. Edit the collection → set timer to 5 min → Start shuffle.
4. Lock the phone. Wait 6 min WITHOUT opening the app.
5. Wake the lock screen — wallpaper has rotated to the next photo.
6. Repeat with a 1 min timer to verify rapid cycling.
7. Stop the shuffle (return to the editor, tap "Stop shuffle") →
   the ongoing notification disappears.
8. Re-activate, then force-kill the app from recents → wallpaper
   should STILL rotate on the timer (the foreground service
   survives the killer).

## Notes

- **The ongoing notification is the price.** Android requires it for
  any service that runs continuously while the app is closed. We use
  `IMPORTANCE_MIN` + `PRIORITY_MIN` so it sits at the bottom of the
  shade and shows no sound / vibration / badge. Stop the shuffle to
  remove it.
- **No JS state writeback.** The native service rotates wallpapers
  without updating `lastChangedAt` / `currentIndex` in JS state. On
  app foreground, the existing AppState resume listener in
  `useShuffleEngineHost` runs `runShuffleBackgroundOnce` which
  catches up the JS state from disk-persisted indices. Minor lag in
  the in-app countdown UI is acceptable for v1; a Phase 2 pass can
  add IPC if needed.
- **Mood-based bg behaviour unchanged.** Mood-based rotation depends
  on `inferContextMoodNow` (time + steps logic in JS), which can't
  be ported wholesale to Kotlin without duplicating the catalog
  hashing. Mood-based stays on `expo-background-fetch` + AppState
  resume — best we can do without a separate headless-JS approach.
- **iOS no-op.** Apple doesn't allow programmatic wallpaper change OR
  custom foreground services in the Android sense. The wrapper
  returns `false` from `startShuffleForeground` on iOS, falling back
  to the existing bg-fetch path.
- **Free-tier impact: zero.** No new permission prompts; the FGS
  permissions are declared at install time and granted by default.
  No subscription gate.
- **Battery cost is bounded.** The Handler tick uses ~0 CPU when
  asleep (just a scheduled callback). Per-tick cost is one bitmap
  decode + one `WallpaperManager` call = ~50 ms of CPU. At 5 min
  intervals that's negligible. Longer intervals = even less.
