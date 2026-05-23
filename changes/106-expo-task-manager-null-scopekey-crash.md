# 106 — Fix cold-start crashes: align 6 Expo packages to SDK 55

## Problem

Both phones force-closed on launch with native crashes **before any JS/UI**.
Two different stacks, same underlying cause:

1. Startup: `NullPointerException … TasksPersistence.clearTaskPersistence(:21)
   … TaskService.restoreTasks(:581) … TaskService.<init>`.
2. As soon as the couple background-location task fired a broadcast:
   ```
   java.lang.NoClassDefFoundError: Failed resolution of: Lexpo/modules/core/MapHelper;
     at expo.modules.location.taskConsumers.LocationTaskConsumer.shouldReportDeferredLocations
     … TaskService.handleIntent → TaskBroadcastReceiver.onReceive
   Caused by: java.lang.ClassNotFoundException: expo.modules.core.MapHelper
   ```

### Root cause — wrong package versions

Six Expo packages were installed at **old major versions from a previous SDK**,
mismatched with Expo SDK 55 (`expo@55.0.24`, `expo-modules-core@55.0.25`):

| Package | Was | SDK 55 (bundledNativeModules) |
|---|---|---|
| expo-location | 19.0.8 | ~55.1.10 |
| expo-task-manager | 14.0.9 | ~55.0.16 |
| expo-background-fetch | 14.0.9 | ~55.0.16 |
| expo-sensors | 15.0.8 | ~55.0.15 |
| expo-camera | 17.0.10 | ~55.0.18 |
| expo-notifications | 0.32.17 | ~55.0.23 |

These ship as **precompiled AARs** built against an OLDER `expo-modules-core`
that still had `expo.modules.core.MapHelper`. SDK 55's core removed that class,
so the old `expo-location` AAR throws `ClassNotFoundException` the moment its
location task runs. The old `expo-task-manager` was likewise incompatible and
persisted a task under a null scope key, producing the `TasksPersistence` NPE.

Most other expo packages were already correct (55.x); these six had been pulled
in via plain `npm install <pkg>` (npm `latest` dist-tag = old line) instead of
`expo install`.

## Solution

Align the six packages to their SDK-55 versions (their AARs are built against
the current core — no `MapHelper` reference, consistent task-manager):

- `package.json`: `expo-location ~55.1.10`, `expo-task-manager ~55.0.16`,
  `expo-background-fetch ~55.0.16`, `expo-sensors ~55.0.15`,
  `expo-camera ~55.0.18`, `expo-notifications ~55.0.23`, then
  `npm install --legacy-peer-deps`. Pinned packages (react-native-worklets
  ~0.7, reanimated 4.2.1) verified UNCHANGED.

### Plus: purge the legacy corrupt task store on first launch

The OLD `expo-task-manager` already wrote a **null-keyed** entry into the
`TaskManagerModule` SharedPreferences on each device. `adb install -r` keeps
that data, and the new task-manager's `restoreTasks()` would still trip over it
once on the upgrade launch. So `MainApplication.kt` `onCreate()` clears that
prefs file **only when the corrupt null key is present**, before the lazy
`reactHost`/`TaskService` is created. Healthy installs are untouched; the app
re-registers its tasks on launch, so dropping the stale store is safe. Wrapped
in try/catch so cleanup can never crash startup.

## Files changed

- `package.json` — corrected the 6 mismatched versions.
- `android/app/src/main/java/com/kawaii/wallpapers/MainApplication.kt` —
  one-time null-key prefs purge in `onCreate` (+ `import android.content.Context`).

(An earlier patch-package attempt on `expo-task-manager` source was reverted —
the module is precompiled, so source patches don't apply, and version alignment
is the correct fix.)

## Editing android/ directly — and it's GITIGNORED

`android/` is **gitignored** (0 tracked files), so the `MainApplication.kt` edit
is **local to this machine, NOT committed.** That's acceptable:

- The **durable** crash fix is the **version alignment** (`package.json`, which
  IS committed). With `expo-task-manager@55.0.16` the scope key resolves
  correctly → no new null-keyed entries → the NPE can't recur on fresh installs.
- The `MainApplication.kt` purge was a **one-time cleanup** of the corrupt
  null-keyed prefs already on the two test devices (left by the old version,
  kept across `adb install -r`). Once cleaned on first launch it never fires
  again; a fresh install has no corrupt data.

So the prefs-purge is a local belt-and-suspenders safety net, not a load-bearing
committed fix. If `android/` is ever regenerated the edit is lost — moot, since
the committed version fix already prevents the corruption.

## Verification

- `tsc`: no NEW errors after the version bumps (same 5 pre-existing in
  ai/preview.tsx + two foreground modules).
- After rebuild + `adb install -r` on both phones: each cold-starts and runs the
  couple location task without `MapHelper` / `TasksPersistence` crashes.

## Notes

- Pairs with changes/105 (couple reinstall reconnect): both crashes blocked the
  app from launching after a reinstall; with this the reinstalled host can open
  the app and restore its pairing.
- Lesson: always add native modules with `npx expo install`, never plain
  `npm install`, so versions stay SDK-pinned.
