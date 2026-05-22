# Mood — drop UsageStats tier, add Friend Check-in, fix camera "no change"

**Date:** 2026-05-17
**Type:** feature + fix (replaces parts of 034/035)

## Problem

Three user complaints on the changes/035 build:

1. **"Remove app detection — this is worthless."** Tier 2 (UsageStats-driven
   "notification when you open Instagram/Gallery") was confusing and barely
   useful in practice: foreground polling duplicated what a recurring
   notification would do; background polling was OS-delayed by 15–30 min
   (Android constraint, not our bug).
2. **New request: "Be a friend who asks my mood every X minutes."** Recurring
   "how are you feeling?" notification, user-configured interval, 5 emoji
   buttons that change the wallpaper on tap. Works with the app closed.
3. **"Camera doesn't change wallpaper — I held it in front of my face for
   2 minutes and nothing happened."** Root cause: the dedupe in
   `MoodEngineHost` was *"same mood as last apply = skip forever"*. After
   034's frame-stats blend produced steady moods in steady conditions
   (lighting + activity + time of day don't whipsaw frame-to-frame), the
   engine applied the wallpaper exactly **once** per Mood Mode session and
   never again until the mood actually shifted. From the user's seat that
   looked like "camera doesn't work."

## Solution

### 1. Removed Tier 2 (UsageStats / app-open detection)

- Stripped the "When you open other apps" card from `app/(tabs)/mood.tsx`.
- Removed the foreground 60 s `runUsageMonitorPass` poll effect.
- Removed `runUsageMonitorPass` call from `lib/moodBackgroundTask.ts`.
- Restored `lib/moodBootstrap.ts` to gate bg-task registration on
  `backgroundEnabled` only (was `backgroundEnabled || appOpenEnabled`).

The native module (`modules/usage-stats/`) and JS wrapper
(`lib/appUsageMonitor.ts`) **stay on disk** but are unreferenced. Deleting
them would mean another native rebuild and lose the work; leaving them
dormant costs nothing and makes future revival cheap. `appOpenEnabled` +
`appOpenTargets` state remain in the store + persistence for backwards-
compat with existing user settings, just no longer exposed to any UI.

### 2. Added Friend Check-in tier

New surface on Mood Home (replaces the deleted Tier 2 card):

- Master toggle (cyan when on).
- Interval picker row showing current value (default 1 hour) — tap opens
  an Alert with presets: **15 min / 30 min / 1 hr / 2 hr / 4 hr / 6 hr**.
- Live status: "Active · next notification in ~X" or "Last response: X ago
  · next in ~X" if user has tapped at least once.
- Privacy line: local-only, no network.

Implementation:

- `lib/moodNotifications.ts`:
  - New `FRIEND_OPENERS` — 5 rotating opener lines so it doesn't feel like
    a robot ("Hey 👋 how are you feeling?" / "Quick mood check 💭" / …).
    Opener is picked at schedule time (expo-notifications doesn't support
    per-fire content variation).
  - New `scheduleFriendCheckInNotification(minutes)` using
    `SchedulableTriggerInputTypes.TIME_INTERVAL` + `repeats: true` +
    `seconds: minutes * 60`. Minimum 15 min (OS-imposed lower bound on
    Android WorkManager). Maximum 24 h.
  - New `cancelFriendCheckInNotification()` cancels **by stable
    identifier**, not by "cancel all" — see fix below.
- `lib/moodBootstrap.ts`:
  - On boot, schedules the friend notification if persisted state has
    `friendCheckInEnabled` true.
  - Subscribes to store changes so toggling on/off or changing the
    interval reschedules / cancels the OS notification immediately
    without a restart.
- `store/mood.ts`:
  - `friendCheckInEnabled: boolean`, `friendCheckInMinutes: number` (clamped
    15 ≤ N ≤ 1440 in the setter).
- `lib/moodHistory.ts`:
  - New persistence keys: `@kawaii/mood/friend@v1`,
    `@kawaii/mood/friendMin@v1`.

The same notification category (`kawaii.mood.prompt`) and same response
listener (`handleResponse`) handle taps from both daily-prompt and friend-
check-in notifications — one code path translates the action ID → mood →
`applyMoodPhotoFromCollection`. Source recorded as `'notification'` in
mood history (we don't differentiate "daily" vs "friend" responses today).

### 3. Fixed camera "wallpaper never changes" (Bug for changes/034)

Rewrote `MoodEngineHost`'s dedupe logic. Was:

```ts
if (lastAppliedMoodRef.current === m) return;  // skip forever
```

Now:

```ts
const sameAsLast = lastAppliedMoodRef.current === m;
const tooRecent = now - lastAppliedAtRef.current < REAPPLY_AFTER_MS;  // 5 min
if (sameAsLast && tooRecent) return;
```

Behavior:
- **Mood changes** (e.g. happy → calm after lights go off) → apply
  immediately, as before.
- **Mood stays the same for 5 min** → re-apply with a **different photo
  from the same mood bucket** (`pickPhotoForMood` already excludes the
  currently-applied photo via the `excludeId` argument).

Net effect: the user always sees their wallpaper rotate at least every 5
min while Mood Mode is on. The mood-bucket guarantee still holds — happy
mood → happy-bucket photo — so the wallpaper still tracks the detected
mood; the photo within the bucket just rotates so the user perceives
"something is happening."

### 4. Fixed daily ↔ friend notification mutual cancellation

Discovered while wiring (4): both `cancelMoodNotification()` and
`cancelFriendCheckInNotification()` used to call
`cancelAllScheduledNotificationsAsync` — toggling either feature off would
nuke the other one too.

Refactored to per-id cancellation:
- Stable identifiers `DAILY_ID = 'kawaii.mood.daily.v1'` and
  `FRIEND_ID = 'kawaii.mood.friend.v1'` passed to
  `scheduleNotificationAsync` via the `identifier` field.
- New `cancelById(id)` helper uses `cancelScheduledNotificationAsync(id)`.
- Each cancel function targets only its own notification.

Side benefit: removed a latent landmine for any future scheduled
notification anyone adds.

## Files changed

**Modified:**
- `components/MoodEngineHost.tsx` — dedupe rewrite (sameMood + within 5 min)
- `lib/moodBackgroundTask.ts` — removed `runUsageMonitorPass` call + import
- `lib/moodBootstrap.ts` — bg task gates back to `backgroundEnabled` only;
  friend check-in registration on boot + subscriber
- `lib/moodNotifications.ts` — friend check-in scheduling, opener bag,
  per-id cancellation (fixes the daily↔friend conflict)
- `lib/moodHistory.ts` — `friend@v1` + `friendMin@v1` persistence
- `store/mood.ts` — `friendCheckInEnabled` + `friendCheckInMinutes` + setters
- `app/(tabs)/mood.tsx` — removed Tier 2 (card + handlers + foreground poll
  effect + state); added Friend Check-in card (toggle + interval picker
  Alert + status); new `formatMinutes` helper
- `changes/README.md` — index row

**New:**
- `changes/036-mood-friend-checkin-drop-app-detect.md` — this doc

**Unreferenced but kept on disk** (for cheap revival):
- `modules/usage-stats/` (Kotlin + manifest)
- `lib/appUsageMonitor.ts`

## Verification

1. `npx expo run:android --variant release` (JS-only — ~2 min incremental).
2. Open Mood tab. The card layout is now:
   - **Mood Mode** (camera, in-app)
   - **Even when app is closed** (background time/steps + daily prompt)
   - **Friend check-in** (new) ← the cyan icon with chat-bubble
   - Manual override (emoji row)
   - Browse mood packs (horizontal scroll)
3. **Camera fix:** flip Mood Mode on. Note "Currently applied" thumb.
   Wait ~3 s for first scan — wallpaper changes. Now hold the camera in
   any position for 5 minutes. At the 5-min mark you should see the
   wallpaper change again, even though your mood (lighting + activity)
   was steady. The new photo will be from the **same mood bucket** as
   the first — different image, same vibe.
4. **Friend check-in:** flip the new toggle. Premium gate, pool gate,
   notification permission. Tap the row showing the current interval to
   pick a preset (try **15 min** for the fastest test). Wait the chosen
   interval. Notification appears with one of the 5 opener lines + 5
   emoji buttons. Tap any → wallpaper changes immediately, app stays
   closed.
5. **No conflict with daily prompt:** toggle "Daily mood prompt" on (your
   chosen hour) AND Friend check-in on (e.g. 15 min). Both should fire
   independently — turning either off does NOT cancel the other.
6. **Tier 2 gone:** the old "When you open other apps" card should be
   absent. No more chip row, no more Test Now button.

## Notes

- **Android-only constraint disclosure (still true):** background fetch
  cadence is OS-decided regardless of feature. The friend check-in is
  a SCHEDULED notification (different mechanism — OS guarantees the fire
  at the requested interval ±a few sec on Android). It's MORE reliable
  than the background task path.
- **15-min minimum** on Friend Check-in is enforced in `clampCheckInMinutes`.
  iOS allows shorter (1 s in theory) but Android WorkManager's repeating
  alarm has a 15-min floor; setting lower would silently get rounded up
  by the OS, making the UI lie.
- **Battery whitelist on Vivo/Xiaomi still recommended** — same as 034 note.
  Friend Check-in uses the OS notification scheduler, which on stock
  Android survives Doze; on aggressive OEM skins (Vivo OriginOS, Xiaomi
  MIUI Battery Saver, Samsung Adaptive Battery) recurring alarms may be
  delayed or dropped without the app being whitelisted as Unrestricted.
- **Why preset list instead of free-form custom minute input?** Faster UX
  for the common case; an Alert with 6 options + Cancel fits one tap.
  A custom-minutes text input (15-1440) is a 10-line follow-up if anyone
  asks. Backing setter already validates the full range.
- **Why one opener line per scheduled instance, not per fire?** expo-
  notifications' scheduled-content is set once at schedule-time and
  immutable across fires of the same `identifier`. Per-fire variation
  would require cancelling + rescheduling on every fire, which (a)
  re-arms the trigger clock each time (would drift) and (b) requires
  the app to be awake when the previous fire happened. Out of scope.
- **Tier 2 native module + JS lib are NOT deleted** — see "Files changed"
  section. If you want them removed cleanly, that's another change. The
  current state: code present, never called, no native code paths hit at
  runtime. Zero perf impact.
