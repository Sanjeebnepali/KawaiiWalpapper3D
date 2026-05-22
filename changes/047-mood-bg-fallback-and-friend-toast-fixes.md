# Mood feature debug pass — bg fallback, day-stamp timezone, friend-toast honesty

**Date:** 2026-05-18
**Type:** fix

## Problem

User reported four bugs from the mood feature surface:

1. **Sleep/Wake wallpaper doesn't auto-change.** They configured wake + sleep
   hours, but neither the morning nor the evening wallpaper switched on its
   own. Only manually tapping the notification worked.
2. **Time-of-day mood tracking doesn't progress** through morning / mid-day /
   evening / late-night bands as the day advances. Wallpaper stays put.
3. **Friend check-in notification never fires** after toggling on, even
   though the UI confirmed it was scheduled.
4. **Theme-pack shuffle doesn't advance** after the timer interval elapses
   while the app is closed.

## Root causes

### Cause A — `isPremium` was not persisted (bugs 1 + 2)

`store/settings.ts` held `isPremium` in memory only — every cold launch reset
it to `false`. The mood background-task short-circuits on `isPremium`:

```ts
// lib/moodBackgroundTask.ts (before)
if (isPremium && moodState.sleepWakeEnabled && moodState.sleepWakePackId) {
  const swApplied = await runSleepWakeFallback();   // ← never runs after restart
  ...
}
if (!isPremium) return false;                       // ← entire bg task dead
```

The feature toggles themselves (`sleepWakeEnabled`, `backgroundEnabled`, …)
WERE persisted in the mood store, so the user enabled the feature, force-
closed the app, reopened it later — toggles still on, but the silent
auto-apply pipeline that backs both features was dead because `isPremium`
re-defaulted to `false`. Notifications still fired (those don't gate on
`isPremium`), so tapping them worked; ignoring them = no change.

### Cause B — UTC day stamp vs. local hour comparison (bug 1, intermittent)

`runSleepWakeFallback` and the SW notification tap handler both wrote
`new Date().toISOString().slice(0, 10)` as the "today" key. That's the
**UTC** date — but every hour comparison (`hour = now.getHours()`) is in
**local** time. In any non-UTC timezone the two can disagree by ±1 day,
so `lastWakeDay === today` could either re-fire a fresh wake at midnight
UTC or skip a legit one.

### Cause C — Friend check-in UI lied about success (bug 3)

`onToggleFriend` called `setFriendCheckInEnabled(true)` and immediately
toasted "✓ I'll check in every X". The actual schedule call lived in
`moodBootstrap.ts`'s zustand subscriber and silently returned `false` when
the SDK was missing `SchedulableTriggerInputTypes.TIME_INTERVAL` or
`scheduleNotificationAsync` threw. User saw "confirmed" but no
notifications arrived and had no signal anything was wrong.

### Cause D — Theme-pack shuffle has no background runner (bug 4)

Already documented in `constants/shuffle.ts:6` ("Phase 2 will wire
react-native-background-fetch"). The foreground host in
`hooks/useShuffleEngine.ts` catches up within 10 s of the user reopening
the app (it checks `now > lastChangedAt + intervalMs`), so the lag is
only visible while the app is closed. Out of scope for this fix —
behavior matches the documented Phase 1 design. Filed as a follow-up.

## Solution

### 1. Persist the settings store

`store/settings.ts` gains a manual AsyncStorage persistence layer
mirroring the lazy-require pattern from `lib/moodHistory.ts` (so it
degrades gracefully if the bridge isn't linked in a dev session). Every
`set(key, value)` schedules a 200 ms debounced write to
`@kawaii/settings@v1`. New `hydrate()` action + `hydrateSettingsStore()`
helper, awaited at bootstrap.

`lib/moodBootstrap.ts` now awaits all three hydrate calls in parallel
before any handler runs. `lib/moodBackgroundTask.ts:runMoodBackgroundOnce`
hydrates the settings store too so a cold-launched OS bg dispatch (which
can run before the React tree mounts) reads the persisted `isPremium`.

### 2. Local-time day key

New `localDayKey(d)` helper at the bottom of `lib/moodBackgroundTask.ts`:

```ts
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
```

Used in both `runSleepWakeFallback` and `handleResponse`
(`lib/moodNotifications.ts`) in place of the UTC `toISOString().slice(0,10)`.

### 3. Friend check-in — await the real result

`app/(tabs)/mood.tsx onToggleFriend` now imports
`scheduleFriendCheckInNotification` directly and awaits its boolean
return. On `true` → existing toast. On `false` → rolls the toggle back
and pops a premium-alert with an Open-Settings deep-link telling the
user the OS blocked the schedule. The bootstrap subscriber still
handles hot-reschedule on interval changes (no double-fire — the
schedule call cancels prior IDs first).

## Files changed

**Modified:**
- `store/settings.ts` — added AsyncStorage persistence, `hydrate()`,
  `hydrateSettingsStore()`. Debounced 200 ms writes.
- `lib/moodBootstrap.ts` — awaits `hydrateSettingsStore()` alongside the
  other two hydrate calls.
- `lib/moodBackgroundTask.ts` — awaits `hydrateSettingsStore()` at the
  top of `runMoodBackgroundOnce`; switched UTC day stamp to new
  `localDayKey()` helper; exports the helper for reuse.
- `lib/moodNotifications.ts` — imports `localDayKey`; the SW tap handler
  now stamps `today` in local time, matching the bg-task fallback's
  hour comparison.
- `app/(tabs)/mood.tsx` — friend toggle awaits the real schedule
  result; on failure it rolls back the toggle and shows an
  alert+Open-Settings.

## Verification

1. `npx expo start --clear` (no native rebuild needed — all changes are JS).
2. **Persistence smoke test:** open the app, flip Sleep/Wake on via the
   dev "Upgrade" → confirm the wallpaper updates on notification tap.
   Force-close the app from the recents tray. Reopen. `isPremium` should
   still be `true` (the Premium pill in Settings is still gold, locked
   features still unlock).
3. **Sleep/Wake silent fallback:** with Sleep/Wake on and the wake hour
   already in the past today, leave the morning notification untapped.
   Within ~30 min of opening the app (or while it's backgrounded, on
   the OS's bg-fetch cadence) the wallpaper swaps to the wake image and
   the "Currently applied" row gains a "via Sleep/Wake" caption. Before
   this fix it would NEVER swap unless you tapped the notification.
4. **Timezone:** set device timezone to e.g. America/Los_Angeles. Set
   sleep hour to 22:00. At 22:30 local time, the SW notif fires; tap
   it; check that `sleepWakeLastSleepDay` matches today's LOCAL date
   (e.g. `2026-05-18`), not yesterday's UTC date. Easiest check: the
   bg-task at 23:00 local time should NOT re-apply the sleep image
   (would have done so before the fix because the stored day was the
   next UTC day).
5. **Friend toast honesty:** toggle Friend Check-in on with notifications
   permission granted. Toast shows the interval. Now revoke notification
   permission in OS settings without telling the app; toggle off and on
   again. The new code's schedule call returns false → the rollback +
   "Couldn't schedule" alert appears, instead of a misleading
   confirmation.

## Notes

- **Phase 2 shuffle bg-runner is the right follow-up for bug 4.** The
  fix would be a sibling of `moodBackgroundTask.ts` that ticks the
  active shuffle and respects DND + paused. Not bundled here because it
  needs its own task definition + iOS Background App Refresh wiring +
  user-visible "while app closed" disclosure copy, and the design call
  on cadence (which OS-decided floor to pass to `expo-background-fetch`)
  should be made in a dedicated pass.
- **Time-band mood dedupe (`lastBgMood === ctx.mood`) is intentionally
  kept.** Within a single morning/excited band, the wallpaper shouldn't
  thrash on every 30 min tick. Band transitions ARE detected (band A
  mood ≠ band B mood) and trigger a re-apply.
- **No new native deps.** AsyncStorage is already linked (used by the
  mood store via `lib/moodHistory.ts`). The settings store reuses the
  same `require('@react-native-async-storage/async-storage')` pattern
  with the same try/catch fallback.
- **Why not zustand `persist` middleware?** The project already has a
  manual lazy-require pattern in `lib/moodHistory.ts` and
  `store/shuffle.ts`. Reusing it keeps the failure modes consistent and
  avoids a new dependency surface during hydration.
