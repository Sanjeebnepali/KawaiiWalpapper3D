# Disable camera Mood Mode + fix history/photo not updating in app

**Date:** 2026-05-17
**Type:** scope cut + fix

## Problem

User direction:

> *"remove these feature we will fix this in later commentout this part for
> now we only add three feature there and make sure the friend notification
> perfectly work and the time one and i think the photo is not update in app
> also when changes in history also fix these all"*

Two distinct asks:

1. **Drop the camera-based Mood Mode** for this build. Five attempts at
   hiding the CameraView (1×1, 96×128 + opacity, off-screen translate,
   240×320 in 1×1 clip parent, 80×100 visible covered) all hit the same
   Vivo OriginOS HAL behaviour: `PreviewView` refused to allocate a real
   Surface for any non-standard positioning, `takePictureAsync` threw "no
   image data". Logcat confirmed (`getSurface done with results: [null,
   …]` → `postSurfaceClosedError`). Per user, ship without it and revisit
   with a different camera library (vision-camera / ml-kit / face-api.js
   on a future SDK).

2. **Fix the in-app "photo doesn't update / history doesn't refresh"
   bug.** When a notification action fired (Daily Prompt or Friend Check-
   in), the new mood + photo + history entry was written to AsyncStorage,
   but the live in-memory Mood Home didn't see the changes — *"the photo
   is not update in app also when changes in history."*

## Root cause #2 — store sync

Three call sites apply a new mood without going through the
`selectMoodManual` / `reportCameraMood` actions:

- `lib/moodNotifications.ts handleResponse` — notification button tap
- `lib/moodBackgroundTask.ts runMoodBackgroundOnce` — bg ticker
- (camera path, now disabled) — frame detector

Each calls `recordMood(mood, source, conf)` which **does** persist to
AsyncStorage AND **returns** the new history list. But the call sites
discarded the return value and only called `useMoodStore.setState({
currentMood, lastSource, lastConfidence })` — leaving `history` stale in
the in-memory store. The badge dot on the history button + the in-app
history screen kept showing the old list until the next cold launch
re-hydrated.

Plus a second symptom: `hydrate()` is one-shot (guarded by `hydrated`).
So a notification handler that wrote to disk while the React process was
DEAD wouldn't show up next time the user opened the app either — the
store hydrated once at boot, and subsequent re-opens kept the same
in-memory state.

## Solution

### 1. Camera disabled via flag

- `CAMERA_FEATURE_ENABLED = false` constant in `app/(tabs)/mood.tsx`. The
  entire Mood Mode card (including the toggle, pool picker, balance bar,
  live row, Scan Now button, privacy strip) is wrapped in a single
  `{CAMERA_FEATURE_ENABLED ? <card/> : null}` so the toggle to bring it
  back is one line.
- `<MoodEngineHost />` mount + import commented out in `app/_layout.tsx`
  with a code-comment explaining why (PreviewView Surface allocation
  failure on Vivo). Detector, hook, action types, and persistence keys
  stay on disk.

### 2. "Currently applied" promoted to its own always-visible card

Previously the currently-applied wallpaper thumb lived inside the Mood
Mode card — hiding that card meant the user couldn't see which wallpaper
was active. Moved it to a dedicated card right under the screen header.
Bigger thumb (64×80), shows mood emoji + label + photo title + source
("via Notification", "via Background (time + steps)", etc.). Tapping the
card opens the full-screen preview. Always visible whenever
`currentPhotoId` is non-null.

### 3. Sync history into store after every external apply

- `lib/moodNotifications.ts handleResponse`:
  ```ts
  const nextHistory = await recordMood(mood, 'notification', 1);
  useMoodStore.setState({
    currentMood: mood,
    lastSource: 'notification',
    lastConfidence: 1,
    history: nextHistory,   // ← was missing
  });
  ```
- `lib/moodBackgroundTask.ts runMoodBackgroundOnce`: same fix, source
  `'background'`. Also sets `currentMood` + `lastSource` + `lastConfidence`
  which weren't being mirrored to the store either.

### 4. Defensive resync on app resume

New `resyncFromStorage` action on the mood store. Re-reads `history`,
`lastMood`, `mode.currentPhotoId`, `mode.lastBgMood` from AsyncStorage
and diffs against the in-memory store — only writes back fields that
actually changed. Triggered from:

- Mood Home `useEffect` on mount
- `AppState` 'change' listener when state flips to `'active'`

So even if a notification handler ran while the JS process was dead,
the moment the user opens the app or returns from another app, the
Mood Home pulls the latest state from disk.

## Files changed

- `app/_layout.tsx` — commented out `<MoodEngineHost />` + its import
- `app/(tabs)/mood.tsx` — `CAMERA_FEATURE_ENABLED` flag, gated Mood Mode
  card, promoted "Currently applied" card with bigger thumb + source
  label, AppState resync effect, new `labelForSource` helper, new
  `appliedCard` / `appliedCardThumb` styles
- `lib/moodNotifications.ts` — push history into store after notification-
  driven apply
- `lib/moodBackgroundTask.ts` — push history + currentMood + source +
  confidence into store after background apply
- `store/mood.ts` — new `resyncFromStorage` action
- `changes/README.md` + this doc

## Verification

1. `npx expo run:android --variant release` (JS-only — ~2 min).
2. **Mood tab now shows three sections, in order:**
   - Currently applied (top)
   - Even when app is closed (background time/steps + daily prompt)
   - Friend check-in
   - Manual override (emoji row)
   - Browse mood packs

   No camera-based Mood Mode card.

3. **Friend Check-in test (the photo + history sync fix):**
   - Set interval to 15 min (the shortest reliable value on Android).
   - Open Mood Home, note the "Currently applied" thumb + the small dot
     next to the history clock icon.
   - Lock the phone, wait the interval, notification arrives.
   - Tap any emoji from the notification (don't open the app).
   - **WITHOUT** opening the app, wait for next mood prompt OR open the
     app. The "Currently applied" thumb should reflect the new photo
     with "via Notification" caption.
   - Open the history screen → the new entry shows at the top with
     "Notification" source pill.

4. **Daily Mood Prompt** (Tier 3):
   - Set hour to the next available 5-min boundary (or test with ADB).
   - Same flow as Friend check-in — tap → wallpaper changes → "Currently
     applied" card updates.

5. **Auto-change in background** (Tier 4):
   - Toggle on, hit "Run background now (test)".
   - Wallpaper changes. "Currently applied" updates with "via Background
     (time + steps)" caption.
   - Wait ≥ 1 hour, OS WorkManager should tick → same thing happens
     without user input.

6. **App-killed → re-open sync** (defensive resync test):
   - Force-quit the app (swipe from recents).
   - Wait for the next Friend Check-in / Daily Prompt notification.
   - Tap an emoji on the notification.
   - Open the app fresh from launcher.
   - "Currently applied" should reflect the post-tap state, history
     should show the new entry. (Previously: same as before tap.)

## Notes

- **Camera disable is one line to revert.** Flip
  `CAMERA_FEATURE_ENABLED = true` in `mood.tsx` and uncomment
  `<MoodEngineHost />` + its import in `_layout.tsx`. All store fields,
  detector, image-manipulator analysis, and the auto-scan loop stay on
  disk. Re-enable with a different camera library next time you're
  willing to invest 19 min of native rebuild and a fresh log capture.
- **The "currently applied" card is a UX upgrade independent of the
  camera disable.** Even when the camera path comes back, users will
  benefit from seeing the active wallpaper at the top of Mood Home
  regardless of which tier set it.
- **`resyncFromStorage` only diffs by top-history-entry id.** Cheap.
  Doesn't trigger a full re-render storm on every AppState change —
  only when storage actually has fresh data.
- **`hydrate` remains one-shot** intentionally: it does first-load
  bootstrap (history limit handling, default fallbacks). `resyncFromStorage`
  is its lighter-weight follow-up that doesn't reset the `hydrated` flag.
