# Mood — background context engine + daily notification

**Date:** 2026-05-16
**Type:** feature

## Problem

The Mood Mode shipped in changes/027 only works while the app is open
(OS-level constraint — Android 10+ and iOS both block background camera).
User pushback: *"this means user need to open app again and again, that
is not possible"*. They asked for an approach that works even when the
phone is in their pocket.

## Solution

Two camera-free additions, both gated independently of the in-app camera
engine:

1. **Background context engine** — a scheduled task runs every 30–60 min
   (OS decides actual cadence), reads time-of-day + day-of-week + last-hour
   step count, infers a likely mood via a hand-tuned heuristic
   (`lib/contextMood.ts`), and applies a wallpaper from the active Mood
   Collection through the existing `applyMoodPhotoFromCollection` pipeline.
   No camera. No permission popups beyond optional ACTIVITY_RECOGNITION.

2. **Daily mood-prompt notification** — at a user-chosen hour, a local
   notification fires with 5 quick-action buttons (Happy/Sad/Angry/Calm/
   Excited). Tapping a button applies a matching wallpaper without ever
   opening the app. Action handling is wired globally so it works whether
   the app is in foreground, background, or fully killed.

Both gates are independent: user can run background-only, notification-only,
both, or neither. All require the same active `moodCollectionId` set up
for in-app Mood Mode — no separate pool selector.

## Architecture

```
            ┌──── while app is OPEN ────┐    ┌──── while app is CLOSED ────┐
            │                            │    │                              │
   User ───▶│  MoodEngineHost (camera)   │    │  expo-background-fetch       │
            │  60 s scan → mood detected │    │  WorkManager / BGAppRefresh  │
            │  → applyMoodPhoto…         │    │  every 30 min – few hours    │
            └────────────┬───────────────┘    └──────────────┬───────────────┘
                         │                                   │
                         ▼                                   ▼
                ┌────────────────────────────────────────────────────────┐
                │  lib/moodEngineActions.applyMoodPhotoFromCollection    │
                │   pickPhotoForMood (hash bucket)                       │
                │   → applyCollectionPhoto → setAsWallpaper              │
                └────────────────────────────────────────────────────────┘
                         ▲
                         │
            ┌────────────┴───────────────┐
            │  Daily notification fires  │
            │  user taps a mood button   │
            │  → handleResponse →        │
            │    applyMoodPhotoFrom…     │
            └────────────────────────────┘
```

Three OS-level subsystems, one shared apply pipeline.

## Files added

- `lib/contextMood.ts` — pure inference (time + weekday + steps → MoodId).
- `lib/stepCount.ts` — lazy-required `Pedometer` wrapper with permission
  helper. Returns `null` whenever unavailable.
- `lib/moodBackgroundTask.ts` — defines + registers the
  `expo-task-manager` task. Top-level `ensureTaskDefined()` so cold-launch
  background dispatch finds the handler before any React mounts. Exposes
  `runMoodBackgroundOnce()` for the "Test now" button.
- `lib/moodNotifications.ts` — handles permission, registers a 5-button
  notification category, schedules / cancels the daily prompt, and wires
  `addNotificationResponseReceivedListener` to translate button taps into
  `applyMoodPhotoFromCollection` calls. Records the resulting mood with
  source `'notification'`.
- `lib/moodBootstrap.ts` — single entry point called once from
  `app/_layout.tsx`. Hydrates store, wires notifications, syncs OS
  subscriptions with persisted gates, and subscribes to store changes so
  toggle flips immediately register/unregister the OS resources.

## Files modified

- `package.json` — adds `expo-background-fetch ~14.0.7`,
  `expo-task-manager ~14.0.8`, `expo-sensors ~15.0.7`,
  `expo-notifications ~0.32.13`.
- `app.json` — adds `expo-notifications` and `expo-sensors` plugins;
  appends `ACTIVITY_RECOGNITION` and `POST_NOTIFICATIONS` Android
  permissions.
- `app/_layout.tsx` — calls `bootstrapMoodFeature()` in a one-shot
  `useEffect`.
- `app/(tabs)/mood.tsx` — adds a second card under the Mood Mode card
  with: a "Auto-change in background" toggle, a "Daily mood prompt"
  toggle + time picker (8 AM / 12 PM / 7 PM presets), a "Run background
  now (test)" button, and an honest "OS sets cadence" disclosure.
- `store/mood.ts` — adds `backgroundEnabled`, `notifEnabled`, `notifHour`,
  `lastBgMood` state + setters; extends `hydrate()` to load all four.
- `lib/moodHistory.ts` — adds four new persistence keys, four
  load/save helpers; extends `MoodSource` to include `'background'` and
  `'notification'`.

## Verification

1. `npm install --legacy-peer-deps`
2. `npx expo run:android` (native rebuild required for the four new
   native modules)
3. Open Mood tab. Below the Mood Mode card, the "Even when app is closed"
   card appears with two off-toggles.
4. Pick a Collection (if not already).
5. Flip "Auto-change in background" on. If motion permission isn't granted,
   the OS prompts (skippable — background still works on time alone).
6. Tap "Run background now (test)" → wallpaper changes immediately based
   on current time + step count.
7. Flip "Daily mood prompt" on. OS notification permission prompts.
   Pick a time. Wait for the scheduled hour OR use ADB to fire it sooner.
8. Tap a mood button on the notification → wallpaper changes. App did not
   need to be open.
9. Force-quit. Both toggles persist; next launch re-registers both OS
   subscriptions automatically via the bootstrap.

## Notes

- **Background cadence is OS-decided.** Android WorkManager honours
  `minimumInterval` (we request 30 min) but can delay based on battery,
  Doze, and app-standby buckets. iOS Background App Refresh runs at OS
  discretion — sometimes hours apart. The disclosure copy says so.
- **Motion is optional.** Without ACTIVITY_RECOGNITION, the engine still
  works — `recentSteps()` returns `null`, the heuristic falls back to
  time + weekday only. User isn't blocked by denying motion.
- **Notification actions run without opening the app.** `opensAppToForeground:
  false` on every action; the global response listener is registered at
  bootstrap (before any UI mounts), so cold-launches into a button tap
  also work.
- **`MoodSource` extended.** `'background'` and `'notification'` join
  `'manual'` and `'camera'`. The history screen's existing pill UI gets
  two new badge colours (TBD in a follow-up).
- **All four new native deps lazy-required.** App boots normally pre-
  rebuild; new toggles silently no-op until `expo run:android` links them.
- **No new routes.** All controls live on the existing Mood Home.
