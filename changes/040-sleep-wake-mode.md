# Sleep/Wake mode — auto-swap wallpaper morning vs night

**Date:** 2026-05-17
**Type:** feature

## Problem

User idea:

> *"each album have two image — one is sleeping and one is wake up image
> and it will auto apply everyday … at night sleeping time sleeping
> wallpaper, and morning wakeup wallpaper apply … and it will auto change
> by our other features."*

Wantsgside the  a fourth tier alonthree existing notification/background
features: a Sleep/Wake mode that auto-switches the wallpaper between a
"morning" image and a "night" image at user-chosen times each day, using
curated 2-image packs.

## Honest constraint disclosed up front

Android local notifications **cannot** auto-execute JS code when they fire
in the background — the OS displays the notification and that's it.
A wallpaper apply requires either user interaction (tap) or our
background task to run.

So Sleep/Wake ships as a **hybrid**:
1. At wake/sleep time → notification fires with "Apply wallpaper" action
2. Tap the notification body OR the action button → wallpaper changes instantly
3. **Fallback**: if the user ignored the notification, the existing background
   task (already runs every ~30 min) detects we're past the wake/sleep
   hour and the corresponding image hasn't been applied today → applies it
   automatically

Total worst-case lag: 30–40 min after the configured time. Best case (user
taps notification): instant. The user is told this up front in the card copy.

## Solution

### Data — curated packs

`constants/sleepWakePacks.ts` defines `SLEEP_WAKE_PACKS: SleepWakePack[]`
with 6 starter pairs (Kawaii Baby, Pastel Soft, Bunny Friends, Cosmos,
Anime Soft, Nature Calm). Each has:

```ts
{
  id, name, tagline, accentColor,
  wakeImage,  wakeId,   // sw-<pack>-wake
  sleepImage, sleepId,  // sw-<pack>-sleep
}
```

Stable `wakeId` / `sleepId` flow through the existing mood-history pipeline
so the photos show up in history + the "Currently applied" card alongside
regular Collection photos. `getSleepWakePhoto(photoId)` resolves the
sw-prefixed IDs to `{ id, image, title }` since they aren't in mockData.

### Store + persistence

Six new mood store fields:
- `sleepWakeEnabled: boolean`
- `sleepWakePackId: string | null`
- `sleepWakeWakeHour: number` (0–23, default 7)
- `sleepWakeSleepHour: number` (0–23, default 22)
- `sleepWakeLastWakeDay: string | null` (YYYY-MM-DD)
- `sleepWakeLastSleepDay: string | null` (YYYY-MM-DD)

Six new AsyncStorage keys (`@kawaii/mood/sw@v1`, `…/swPack@v1`,
`…/swWake@v1`, `…/swSleep@v1`, `…/swLastWakeDay@v1`, `…/swLastSleepDay@v1`).
Six new setters on the store + matching `save*` helpers in
`lib/moodHistory.ts`. Hydrate reads all six.

`MoodSource` extended with `'sleepwake'` so history rows can render a
dedicated source label.

### Notifications

`scheduleSleepWakeNotifications(packId, packName, wakeHour, sleepHour)`
in `lib/moodNotifications.ts` schedules TWO daily-trigger notifications:

- ID `kawaii.mood.sw.wake.v1` — "☀️ Good morning" at wake hour
- ID `kawaii.mood.sw.sleep.v1` — "🌙 Sleep well" at sleep hour

Both use a new category `kawaii.mood.sleepwake` with a single action
button "✓ Apply wallpaper". The notification's `data: { tag, packId }`
tells `handleResponse` which image to apply on tap.

Per-ID cancellation continues to work (`cancelById(SW_WAKE_ID)` etc.),
so toggling Sleep/Wake off doesn't kill the Daily Mood Prompt or Friend
Check-in notifications.

### Notification tap handler

`handleResponse` (in `lib/moodNotifications.ts`) was previously
mood-prompt only. Extended to detect the SW tag first:

```ts
if (tag === SW_WAKE_TAG || tag === SW_SLEEP_TAG) {
  const r = await applySleepWakePhoto(packId, kind);
  if (r.ok && r.photoId) {
    await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
    await useMoodStore.getState().setSleepWakeLastWakeDay(today);  // or Sleep
    const next = await recordMood('happy' | 'calm', 'sleepwake', 1);
    useMoodStore.setState({ currentMood, lastSource: 'sleepwake', history: next });
  }
  return;
}
// …existing mood-prompt path
```

Maps wake → `'happy'` and sleep → `'calm'` so the mood-history list and the
"Currently applied" badge stay coherent.

### New engine action

`lib/moodEngineActions.ts applySleepWakePhoto(packId, kind)` — looks up the
pack, picks the right URL, calls the existing `setAsWallpaper(url, id, 'both')`
pipeline (which downloads the remote URL to cache then calls our native
WallpaperSetter module). Returns `{ ok, message, photoId }` matching
`applyMoodPhotoFromCollection`.

### Background-task fallback

`lib/moodBackgroundTask.ts` `runMoodBackgroundOnce` now starts with a
Sleep/Wake check (before the Tier 4 context-mood gate):

```ts
if (isPremium && sleepWakeEnabled && sleepWakePackId) {
  const applied = await runSleepWakeFallback();
  if (applied) return true;  // don't overwrite within the same tick
}
```

`runSleepWakeFallback` computes the current hour, decides whether we're
in the wake window or sleep window (correctly handles the wrap-around case
where sleepHour > wakeHour — most common: sleep 22:00, wake 07:00), and
applies the matching image only if `lastWakeDay !== today` (or
`lastSleepDay`). Per-day stamp means the bg task never re-applies later
ticks the same day.

### Bootstrap

`lib/moodBootstrap.ts` re-schedules the SW notifications on app start
(reads persisted state, calls `scheduleSleepWakeNotifications`). The
store subscriber re-schedules on ANY of (enabled / pack / wake hour /
sleep hour) changing, cancels both notifications when enabled flips off.

### UI

New "Sleep / Wake mode" card on Mood Home, between Friend check-in and
Manual override. Components:

- **Master toggle** — premium-gated. Turning on: requires picked pack +
  notification permission (premium alert if missing). Turning off: cancels
  both scheduled notifications.
- **Pack picker row** — shows the active pack's name + tagline + a dual
  thumbnail (top half = wake image, bottom half = sleep image). Tap →
  pack-picker bottom-sheet.
- **Pack picker bottom-sheet** — lists all 6 packs as rows with the dual
  thumb + name + tagline + selected check. Tap a row → sets pack and
  dismisses.
- **Time pickers** — two side-by-side cells ("Wake" with sun icon, "Sleep"
  with moon icon) showing the configured hour. Tap → premium alert with 4
  presets each (Wake: 6/7/8/9 AM, Sleep: 9/10/11 PM / 12 AM).
- **Privacy strip** — honest copy: *"Tap the notification to apply
  instantly. If you miss it, the background task swaps it within ~30 min."*

Each interactive element uses the existing `premiumAlert` /
`PremiumSheet` aesthetic so the whole card matches the rest of Mood Home.

## Files changed

**New:**
- `constants/sleepWakePacks.ts` — 6 curated pack pairs + 2 resolvers
- `changes/040-sleep-wake-mode.md`

**Modified:**
- `store/mood.ts` — 6 new state fields, 6 setters, hydrate extension
- `lib/moodHistory.ts` — 6 persistence keys + 6 save helpers, type
  extension on `LoadedMoodMode` + `memSnapshot`, `MoodSource` adds `'sleepwake'`
- `lib/moodEngineActions.ts` — `applySleepWakePhoto`
- `lib/moodNotifications.ts` — SW_CATEGORY, SW_WAKE_TAG / SW_SLEEP_TAG,
  scheduling + cancellation, per-ID tracking for the 2 SW notifications,
  handleResponse SW branch
- `lib/moodBackgroundTask.ts` — sleep/wake fallback runs BEFORE the
  context-mood path; new `runSleepWakeFallback()` helper
- `lib/moodBootstrap.ts` — on-boot schedule + subscriber re-schedule on
  any SW input change
- `app/(tabs)/mood.tsx` — Sleep/Wake card, pack-picker sheet, time
  picker handlers, dual-thumb component, currentPhoto resolver now
  checks `getSleepWakePhoto` first, new `swStyles` StyleSheet

## Verification

1. `npx expo run:android --variant release` (JS-only — ~2 min).
2. Open Mood tab. The fourth card "Sleep / Wake mode" appears between
   Friend check-in and Manual override.
3. Tap the master toggle (gold accent) → premium gate (Upgrade dev) →
   "Pick a pack first" toast + pack-picker opens.
4. Pick **Kawaii Baby** → toast "✓ Pack: Kawaii Baby", picker dismisses,
   pack row now shows the Kawaii Baby dual-thumb.
5. Tap toggle again → notification permission (premium alert) → grant →
   toast "✓ Sleep/Wake on".
6. Tap Wake row → premium alert with 6/7/8/9 AM → pick. Card updates.
7. Tap Sleep row → premium alert with 9 PM/10 PM/11 PM/12 AM → pick.
8. **The fastest test**: change device time to 1 minute before your wake
   hour. Wait. Notification fires with "☀️ Good morning · Tap to apply
   your Kawaii Baby wake-up wallpaper" and an "✓ Apply wallpaper" button.
   Tap it → wallpaper changes immediately, app stays closed.
9. **The ignored-notification fallback**: change wake hour to something
   already past today (e.g. 6 AM if it's 8 AM). DON'T tap the
   notification. Open the app or wait for the next bg-task tick
   (≈ 30 min). Wallpaper should change to the wake image without you
   doing anything. The "Currently applied" card at the top shows the
   wake image with "via Sleep/Wake" caption.

## Notes

- **Wake/sleep window math correctly handles wrap-around.** The common
  case is `sleepHour > wakeHour` (e.g. wake 7, sleep 22) → sleep window is
  `[22:00, 24:00) ∪ [00:00, 07:00)`. The fallback checks
  `hour >= sleepHour || hour < wakeHour` for this case. Reverse case
  (`sleepHour <= wakeHour`, weird but supported) uses
  `hour >= sleepHour && hour < wakeHour`.
- **Per-day stamps prevent re-apply.** If the bg task fires at 7:05, 7:30,
  8:00, 8:30 — only the first one in the wake window applies. Subsequent
  ones see `lastWakeDay === today` and skip.
- **Per-ID notification cancellation** continues to be safe across all
  notifications now (Daily Prompt, Friend Check-in, SW Wake, SW Sleep) —
  toggling any one doesn't nuke the others. (Bug fixed in changes/037.)
- **Premium gate uses the existing `gatePremium`.** Phase 2 RevenueCat
  swap covers this feature automatically.
- **Curated packs use picsum.photos seeds** for now since the rest of the
  mock data does. Swap to real assets by replacing the URLs in
  `constants/sleepWakePacks.ts` — no other code changes needed.
- **No new native deps.** Reuses existing `expo-notifications`,
  `expo-background-fetch`, `expo-task-manager`, and our own
  `WallpaperSetter` module.
- **Camera Mood Mode stays disabled** (CAMERA_FEATURE_ENABLED flag from
  changes/039). The shipped feature set is now: Currently Applied card +
  Background (time/steps) + Daily Prompt + Friend Check-in + **Sleep/Wake
  mode** + Manual emoji + Browse mood packs.
