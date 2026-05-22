# Mood: friend 1-min chain, sleep/wake foreground auto-apply, custom-album save fix, pick-collection error boundary

**Date:** 2026-05-19
**Type:** fix

## Problem

User report covering four distinct bugs in Mood Mode:

1. **Friend check-in blocked at sub-15-min intervals.** User set the
   interval to 1 minute and the notification never fired. Auto mood
   detection by day worked, so notifications themselves were fine —
   it was the schedule that wasn't firing.
2. **Sleep / Wake wallpaper doesn't apply when waking up or going to
   sleep.** The notification appeared at the scheduled hour, but the
   wallpaper only changed if the user manually tapped it; the user
   expected it to apply on its own.
3. **"Download wallpaper" errors in the custom album.** Tapping Save to
   Gallery on a wallpaper that originated from the custom mood pool
   (gallery pick or URL paste) surfaced a generic "Failed to save image"
   toast everywhere the menu was available.
4. **"Build full album" routes to the phone home screen.** From Mood
   → Custom → Add to your custom mood pool → "Build full album…" the
   app appeared to crash and drop the user back at the OS launcher
   instead of opening the pool picker.

## Solution

### 1. Friend check-in — chained one-shot notifications for <15 min

Root cause: Android WorkManager's periodic-work floor is 15 min. Any
`TIME_INTERVAL` trigger with `repeats: true` and a sub-15-min interval is
silently rounded up by the OS. The previous schedule call (a single
repeating trigger) was accepted by `expo-notifications` and then
quietly stretched to ~15 min by the platform — looking from the user's
side exactly like "nothing fires."

`lib/moodNotifications.ts:scheduleFriendCheckInNotification` now
branches on the requested interval:

- **≥ 15 min (`FRIEND_CHECK_IN_ANDROID_FLOOR`)** — unchanged. Single
  repeating notification with identifier `FRIEND_ID`.
- **< 15 min** — pre-schedules a CHAIN of `FRIEND_BATCH_COUNT` (30)
  one-shot notifications at `intervalSec * i` for `i = 1..30`, with
  identifiers `kawaii.mood.friend.chain.{i}`. Each fire is independent
  so the WorkManager floor doesn't apply. At 1 min interval this gives
  the user a guaranteed 30-min runway of every-minute fires; at 5 min,
  2.5 h of every-5-min fires.

Chain refill happens in two places:
- `bootstrapMoodFeature` already calls
  `scheduleFriendCheckInNotification` whenever the app launches and
  `friendCheckInEnabled` is true → the chain rebuilds from scratch on
  every cold start.
- New `maybeRefillFriendChain` is invoked from the notification
  response handler after any FRIEND-tagged tap. Each tap consumes one
  slot from the chain; refilling on tap keeps the cadence alive as
  long as the user interacts with the app at least once per batch
  window (30 × interval).

`cancelFriendCheckInNotification` was widened to nuke BOTH paths —
periodic slot AND chain ids — so toggling the interval from 60 min
(repeating) to 1 min (chain) doesn't leave the old 60-min fire
dangling.

iOS budget: 30 chained + 1 daily + 2 sleep/wake = 33 slots, safely
under the 64-slot limit per app.

### 2. Sleep / Wake — foreground auto-apply

The wake/sleep notification's only path to actually CHANGING the
wallpaper used to be the user tapping the notification action; the
bg-task fallback would catch up later (often much later under Doze)
but the user complained that they "don't see the wake-up wallpaper"
when they actually wake up.

`lib/moodNotifications.ts:setNotificationHandler` now inspects the
notification's `data.tag` and `data.packId` before returning the
display config. For `SW_WAKE_TAG` / `SW_SLEEP_TAG` it fires (in the
background, no await on the return) a new `autoApplySleepWake(kind,
packId)` helper that:

1. Calls `applySleepWakePhoto(packId, kind)` — same code path as the
   tap-driven response, so curated packs and custom pairs both work.
2. Sets `currentPhotoId`, stamps `sleepWakeLastWakeDay` or
   `sleepWakeLastSleepDay` for the local day (so the bg-fetch
   fallback doesn't re-apply), and pushes a `'sleepwake'` history
   entry.

`setNotificationHandler` runs whenever the JS bundle is alive at fire
time — typically: app in foreground; on Android also during the brief
grace period after backgrounding. Three redundant layers now cover
the full state matrix:

- App foreground at fire time → foreground handler auto-applies.
- App backgrounded with bg-fetch reachable → `runSleepWakeFallback`
  inside the bg-task catches up on the next OS dispatch.
- App killed / Doze blocking bg-fetch → user tap routes through
  `handleResponse` as before.

### 3. Custom album save — content:// + private-cache fallback

Two related failures inside `lib/wallpaperActions.ts`:

**a) content:// URIs.** `downloadToCache` returned `content://` URIs
unchanged. `MediaLibrary.createAssetAsync` accepts file:// paths but
rejects scoped-storage `content://` URIs on Android 11+ — surfacing
as the "Failed to save image" toast everywhere the menu was
available. Fix: copy `content://` URIs to a real `file://` path in
`cacheDirectory` via `FileSystem.copyAsync` before returning. The
destination filename is derived from the asset id, so repeated saves
of the same wallpaper reuse the cache slot rather than accumulating.

**b) MIUI / ColorOS reject `createAssetAsync` on app-private cache.**
The user's flow ends up with a `file:///data/.../cache/kawaii-user-…`
URI when they save a URL-downloaded or gallery-picked photo. Some
OEMs reject `createAssetAsync` on app-private file paths with a
silent "Could not get asset" rejection. `saveToGallery` now wraps the
featured-folder branch in a try/catch and falls back to
`MediaLibrary.saveToLibraryAsync` (which uses MediaStore directly and
is more lenient). The fallback toast clarifies that the album was
skipped — the photo still lands in the gallery.

### 4. Pick-collection error boundary + defensive coercions

`app/mood/pick-collection.tsx` now exports a named `ErrorBoundary`
component — Expo Router's per-route boundary convention — that
catches render-time throws and shows a recoverable error screen
instead of letting the JS bundle crash. The previous behaviour, where
a single malformed Collection in AsyncStorage could throw inside the
row-map and bubble up past every boundary, looked from the user's
side like "the app went to the phone home screen."

Inside the screen body, the `allRows` `useMemo` now:

- Coerces `collections` and `themePacks` to safe arrays.
- Filters out null/undefined entries and rows lacking the minimum
  shape (`id` string, `seedPackId !== undefined` for user rows, etc.).
- Coerces every `photoIds` access to an array fallback before passing
  to `tallyMoodBuckets` (which used to throw on `undefined.forEach`).
- Falls back to `''` for missing thumbs / titles so `<Image source={{
  uri: '' }}>` is the worst-case render rather than a `cannot read
  thumbs of undefined` throw.

`CollectionRow` derives `photoCount` from a safe-array length rather
than reading `row.photoIds.length` directly, matching the same
defensiveness.

The unused `import { type Collection } from '../../constants/shuffle'`
was dropped at the same time — it had no runtime cost but was
flagged as dead by the type checker after the coercions.

## Files changed

- `lib/moodNotifications.ts`
  - Added `FRIEND_CHAIN_PREFIX`, `FRIEND_BATCH_COUNT` constants +
    `scheduledFriendChainIds` ledger.
  - `scheduleFriendCheckInNotification` branches on
    `clampedMin < FRIEND_CHECK_IN_ANDROID_FLOOR` to schedule the
    one-shot chain; ≥15 min path unchanged.
  - `cancelFriendCheckInNotification` cancels both paths, iterating
    chain ids defensively across the prefix range to survive a
    process restart.
  - New `maybeRefillFriendChain()` reads the live interval from the
    mood store and re-batches if sub-15.
  - `handleResponse` calls `maybeRefillFriendChain()` after FRIEND-
    tagged taps.
  - `setNotificationHandler.handleNotification` inspects
    `data.tag`; for SW tags it fires `autoApplySleepWake(kind, packId)`
    before returning the display config.
  - New `autoApplySleepWake(kind, packId)` mirrors the SW branch of
    `handleResponse`.
- `lib/wallpaperActions.ts`
  - `downloadToCache` copies `content://` URIs to a cache `file://`
    path via `FileSystem.copyAsync`. Pure `file://` URIs still pass
    through unchanged.
  - `saveToGallery` wraps the featured-folder branch in try/catch with
    a `saveToLibraryAsync` fallback. `console.warn` no longer
    `__DEV__`-gated so release-APK errors show up in `adb logcat`.
- `app/mood/pick-collection.tsx`
  - New named `ErrorBoundary` export — Expo Router route-level
    boundary.
  - `allRows` `useMemo` defensively coerces collections / themePacks /
    photoIds / thumbs / titles.
  - `CollectionRow` reads a safe `photoCount`.
  - Dropped unused `Collection` type import.
  - New error-state styles (`errorWrap` / `errorTitle` / `errorMsg` /
    `errorBtn` / `errorBtnText`).
- `changes/README.md` — index row (added separately).

## Verification

JS-only change. Rebundle:

```powershell
npx expo start --clear
```

If the existing Metro worker on 8081 keeps serving stale errors, follow
the recovery steps in `CLAUDE.md → "Metro stale-worker gotcha"`.

On the device:

1. **Friend at 1 min:**
   - Mood → toggle Friend check-in on → tap the interval row → enter
     `1` in the custom-minutes sheet → confirm.
   - **Expected:** toast `"✓ I'll check in every 1 min"`. A notification
     fires within ~1 min. Tap any emoji → wallpaper changes. A second
     notification fires another ~1 min later (the response handler
     refilled the chain). Repeat 5+ times to confirm the cadence holds.
   - **Old bug:** toast appeared but no notification ever fired.

2. **Sleep / Wake auto-apply (foreground):**
   - Mood → Sleep/Wake on → choose any pack → set Wake hour to
     `(current hour + 1)` and immediately switch it BACK to one minute
     in the future via DAILY rescheduling on the underlying notification
     (or pick the curated pack with the closest fire time and wait).
   - When the notification fires while the app is open, the wallpaper
     should auto-change without a tap. Backgrounding the app does not
     break this — `setNotificationHandler` runs during the grace
     period.
   - **Old bug:** notification appeared but wallpaper did not change
     unless the user tapped it.

3. **Custom album save:**
   - Mood → Custom → From Gallery → pick a photo → Done. (Photo lands
     in the custom pool and instant-applies as the wallpaper per
     change 056.)
   - Tap the pool row to open it → tap the photo → preview screen →
     long-press → Save to Gallery.
   - **Expected:** toast `"✓ Saved to gallery"` OR `"✓ Saved to
     'Kawaii Baby'"` if Featured Folder is on. Open the system gallery
     and confirm the photo is there.
   - **Old bug:** `"Failed to save image"` toast.

4. **Build full album:**
   - Mood → Custom → "Build full album…".
   - **Expected:** pool picker opens, listing user pools + theme packs.
     If a malformed row was in the store, the error boundary now
     surfaces a "Couldn't open the pool picker" screen with a Try
     again button instead of crashing the bundle.
   - **Old bug:** brief flash then phone home screen.

## Notes

- The chain approach for sub-15-min friend check-ins has one
  user-visible limitation: if the user goes 30 × interval without
  opening the app OR tapping any friend notification, the chain
  exhausts and no further fires happen until the next app open. At
  1 min that's 30 min of silence — generally fine because users at
  1-min cadence are interacting heavily. Documented here so future-us
  doesn't read it as a regression.
- Sleep / Wake auto-apply still falls back to the user-tap path when
  the JS bundle is fully asleep (app killed + bg-fetch throttled by
  Doze). Genuinely killing that gap requires an Android
  `AlarmManager.setExactAndAllowWhileIdle` bridge — already noted as
  follow-up in change 055.
- `MediaLibrary.saveToLibraryAsync` fallback in `saveToGallery` lands
  the photo in the OS default Pictures album, NOT in the Kawaii Baby
  Featured Folder. Toast clarifies. Album-targeted save still works on
  devices that accept `createAssetAsync` for app-private cache paths
  (most stock Android, Pixel, Samsung One UI ≤ 6); only the strict
  MIUI / ColorOS lineage hits the fallback.
- The route-level `ErrorBoundary` only catches RENDER errors from this
  screen's component tree. A throw inside `useShuffleStore` /
  `useMoodStore` hydration runs at app launch and is owned by the
  bootstrap path — not this boundary. If the user reports another
  "back to launcher" after this change, that's the next place to
  look.
