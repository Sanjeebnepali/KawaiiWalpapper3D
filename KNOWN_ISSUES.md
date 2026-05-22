# Known issues — why some features are not 100% reliable

This doc explains, feature by feature, **what does not work perfectly
in the app today, why the platform / OEM is in the way, and what we
chose to do about it.** It's the honest counterpart to the change log
— `changes/` says what we fixed; this file says what we couldn't.

Read this *before* filing a bug or shipping more code on these
features. Most "isn't this broken?" reports map to a known platform
constraint rather than an actual app bug, and the workarounds are
listed below.

Last reviewed: 2026-05-20 (against changes through 082).

> **2026-05-20 update:** changes/080–082 closed several long-standing
> items below — the Doze-suspended timers (Shuffle/Friend/Sleep-Wake all
> moved to `AlarmManager.setAndAllowWhileIdle`), the post-reboot gap
> (`BOOT_COMPLETED` receivers), and the "features fight each other"
> problem (single-active-mode coordinator, changes/080). Resolved items
> are struck through with a ✅ pointer to the change.

---

## 1. Sleep / Wake — "set once, never open the app again"

### What works today

- Notification at the configured wake / sleep hour fires reliably.
- **Foreground auto-apply** (change 057): wallpaper changes without
  a tap as long as the app's JS bundle is alive at fire time.
- **Native foreground service** (change 058): wallpaper changes
  even when the app is force-closed, as long as the FGS is alive.
- **Background-fetch catch-up** (change 055): on every app resume,
  if the user missed today's wake / sleep window, the correct
  wallpaper is applied within ~1 s.
- **Tap fallback** (change 040): tapping the notification always
  applies the wallpaper.

### What still doesn't work

1. ~~**Doze mode can drift the fire by up to ~10 min.**~~ ✅ **FIXED
   (changes/082).** Sleep/Wake (and Shuffle, changes/081, and Friend)
   no longer use `Handler.postDelayed` — they schedule
   `AlarmManager.setAndAllowWhileIdle`, which fires through Doze. Deep
   Doze can still batch `setAndAllowWhileIdle` to ~1 fire / 9 min, so a
   7:00 fire may land within a few minutes rather than dead-on, but the
   "froze for hours / missed entirely" failure is gone.

2. ~~**A phone reboot kills the FGS.**~~ ✅ **FIXED (changes/082).**
   Each FGS module now has a `BOOT_COMPLETED` `BroadcastReceiver`
   (`ShuffleBootReceiver` / `FriendBootReceiver` /
   `SleepWakeBootReceiver`) that re-arms the alarm after a reboot.
   Shuffle + Sleep/Wake (which apply natively) resume fully with no app
   open; Friend re-arms but its first prompt still waits for the next
   app open (JS posts the prompt). NOTE: a powered-OFF phone runs
   nothing — this covers reboots, not "phone is off."

3. **OEM "force stop" from app info kills it harder.** If the user
   pulls down Recents and swipes the app away, `START_STICKY`
   typically restarts the service. But if the user goes into
   **Settings → Apps → Kawaii Baby → Force stop**, Android marks
   the package as user-stopped and refuses to restart any of its
   services until the user opens the app again. No workaround.

4. **On Vivo / MIUI / ColorOS / OneUI / HyperOS without the user
   whitelisting us:**
   - Battery optimization must be set to "No restrictions"
   - "Allow autostart" must be on
   - "Allow background activity" must be on
   These OEM settings are above the OS API surface — no JS / Kotlin
   we ship can flip them. If the user reports "stopped working
   after a few hours" on these devices, that's the cause.

5. **The ongoing notification.** Android *requires* an FGS to show
   a persistent low-priority notification — non-negotiable. It
   sits at the bottom of the shade ("Kawaii Baby — Sleep/Wake
   mode · Wake at 7 AM · Sleep at 10 PM"). Some users perceive
   this as a bug; it's the legal contract for "I'm allowed to keep
   running when closed." Removing the notification = removing the
   ability to run with app closed.

6. **iOS does nothing.** Apple does not permit programmatic
   wallpaper change from a third-party app. None of the above
   applies on iOS; the feature degrades to "save to Photos, tap
   Share → Use as Wallpaper."

---

## 2. Friend check-in at < 15-min intervals

### What works today

- Any interval ≥ 15 min: single repeating `TIME_INTERVAL` trigger,
  fires precisely.
- Any interval < 15 min (change 057): pre-scheduled chain of 30
  one-shot notifications at `intervalSec * i` for `i = 1..30`.
  Refills on every app open and on every notification tap.

### What still doesn't work

1. **The chain runs out after 30 × interval if you neither open
   the app nor tap any friend notification.** At 1 min interval
   that's 30 min of silence, then nothing. The chain is designed
   to self-heal on tap, but if the user genuinely ignores every
   notification AND doesn't open the app, the cadence dies.
   Reasonable for the use case — users on 1-min cadence are
   interactive by definition.

2. **Battery cost is real at < 5 min cadences.** Each fire wakes
   the OS briefly. At 1 min that's 60 wakes per hour. We don't
   block the user from setting it, but it's documented in the UI
   with a soft warning per change 036.

3. ~~**No native AlarmManager path.**~~ ✅ **FIXED (changes/082).**
   Friend check-in now ticks via `AlarmManager.setAndAllowWhileIdle`
   in `FriendAlarmReceiver`, re-armed every fire — no 30-fire ceiling,
   no Doze coalescing. The FGS keeps the JS bundle alive so the prompt
   still posts through the existing `fireMoodPromptNotification` path.
   (Sub-minute intervals in deep Doze are still throttled to ~1/9 min
   by `setAndAllowWhileIdle` — the price of not needing
   `SCHEDULE_EXACT_ALARM`.)

---

## 3. Custom album — save / download wallpaper

### What works today

- Saving any in-app wallpaper to gallery (regular flow).
- Saving a custom-pool wallpaper with the "Featured Folder" toggle
  ON, on stock Android / Pixel / Samsung One UI ≤ 6.
- Saving a custom-pool wallpaper with the toggle OFF (no album)
  on every Android — falls back to `MediaLibrary.saveToLibraryAsync`.
- Change 057's `content://` → `file://` copy fixes gallery-picked
  custom photos saving through MediaLibrary.

### What still doesn't work

1. **"Save to Featured Folder" on MIUI 14+ / ColorOS 14 falls back
   to plain gallery save.** `MediaLibrary.createAssetAsync` rejects
   app-private cache `file://` paths on those OEMs with a silent
   "Could not get asset" rejection. Change 057 catches the
   rejection and falls back to `saveToLibraryAsync`, which works
   but lands the photo in the default Pictures album instead of
   "Kawaii Baby." Toast clarifies: `"✓ Saved to gallery (album
   skipped)"`. Not a bug we can close in JS — MediaStore on those
   OEMs simply refuses the operation.

2. **`content://` URIs from cross-app FileProvider grants may
   refuse to copy.** Some OEM galleries hand back `content://` URIs
   that explicitly disallow cross-app `FileSystem.copyAsync` reads.
   The user sees `"Could not copy gallery image"`. Workaround:
   pick from a different source (the default Photos app usually
   gives URIs that copy fine).

---

## 4. Build full album — route stability

### What works today

- Normal navigation Mood → Custom → Build full album → pool picker.
- The route is registered at the root layout level.
- Render-time crashes inside `pick-collection.tsx` are now caught
  by an exported `ErrorBoundary` (change 057) showing a recoverable
  error screen instead of dropping the user at the phone launcher.

### What still doesn't work

1. **Crashes at the *router* level (before the screen mounts) are
   not caught by the route boundary.** A JS error thrown by
   Expo Router itself during navigation will still bubble up. No
   per-route boundary can catch that. In practice this is rare —
   if it happens, the only place to look is the bootstrap path
   (`bootstrapMoodFeature`, store hydration).

2. **Stale Metro worker on port 8081 can still cause confusing
   bundle errors after route file changes.** This is documented in
   `CLAUDE.md → "Metro stale-worker gotcha"`. Not specific to this
   feature.

---

## 5. Foundational platform constraints

These apply across every feature in the app and are why so many
things are "almost but not 100%."

### Android Doze mode
Phones idle for long periods enter deep Doze, which suspends:
- `Handler.postDelayed` timers
- WorkManager periodic work
- AlarmManager non-AllowWhileIdle alarms

Only `AlarmManager.setAndAllowWhileIdle` and
`AlarmManager.setExactAndAllowWhileIdle` bypass Doze. The former is
free; the latter needs the `SCHEDULE_EXACT_ALARM` permission, which
Google Play increasingly restricts to clock-style apps.

### OEM background killers
Vivo OriginOS, MIUI, ColorOS, OneUI, HyperOS all add a custom layer
on top of stock Android that silently kills third-party background
work to save battery. Confirmed via `adb shell dumpsys jobscheduler`
on Vivo V2231 — no jobs registered for any third-party app despite
WorkManager being called correctly.

The only API-surface defence Android offers is a foreground service
with an ongoing notification. We use it for Shuffle (change 051) and
Sleep / Wake (change 058). Outside of FGS, on these OEMs, **assume
nothing background-related works reliably** unless the user
manually whitelists the app under battery + autostart settings.

### Android 13+ notification permission
`POST_NOTIFICATIONS` is now a runtime permission. We request it at
the right time (when the user toggles a notification-driven feature
on). Some users deny it; those users won't see any notifications.
No workaround — Google's policy.

### WorkManager 15-min periodic floor
Any `repeats: true` trigger with `seconds < 900` is silently rounded
up by Android's WorkManager to 15 min. This is why the friend
check-in chain exists (change 057).

### iOS programmatic wallpaper
There is no public API on iOS to set the device wallpaper from a
third-party app, period. Every iOS wallpaper-related code path in
this repo degrades to "save to Photos and deep-link the user to
Photos → Share → Use as Wallpaper."

### 64-slot scheduled notification budget (iOS)
iOS limits the total number of scheduled notifications per app to
64. We currently use at most ~33 (daily + 2 sleep/wake + 30
friend-chain). Anything beyond ~50 would force a redesign.

---

## 6. Architecture trade-offs we made

For each of these we picked the cheaper option and documented the
gap. None of them are accidents.

| Decision | Cheaper option chosen | More-robust alternative we didn't ship |
|---|---|---|
| Sleep/Wake background fire | FGS + `postDelayed` | FGS + `AlarmManager.setAndAllowWhileIdle` + BroadcastReceiver |
| Sleep/Wake reboot survival | None (JS bootstrap restarts) | `BOOT_COMPLETED` receiver auto-starting the service |
| Sub-15-min friend cadence | JS chain of 30 one-shots | Native AlarmManager-driven cadence |
| Shuffle + Sleep/Wake notifications | Two separate ongoing notifications | One consolidated multi-line notification |
| Custom-album save on MIUI / ColorOS | Fallback to default gallery album | Native MediaStore write via a custom Kotlin module |
| `Build full album` route crash | Route-level `ErrorBoundary` | Inline pool picker as a bottom sheet (no navigation) |

---

## 7. Concrete follow-up work (ordered by user impact)

1. ~~**`BOOT_COMPLETED` receiver for both FGS modules.**~~ ✅ DONE
   (changes/082) — receivers added to all three FGS modules
   (Shuffle, Friend, Sleep/Wake).
2. ~~**Swap Sleep / Wake `postDelayed` for AlarmManager-allow-while-
   idle.**~~ ✅ DONE (changes/082) — Sleep/Wake, Shuffle (081), and
   Friend all moved off `postDelayed` to
   `AlarmManager.setAndAllowWhileIdle`.
3. **Consolidate the (now up to three) FGS notifications into one.**
   ~half a day. Cosmetic but a frequent user complaint when several
   drivers are on. NOTE: with the single-active-mode coordinator
   (changes/080) only ONE continuous driver runs at a time now, so at
   most you'll see that driver's notification + (optionally) Sleep/Wake
   — the worst-case shrank from "all of them" to "two."
4. ~~**Native AlarmManager friend chain.**~~ ✅ DONE (changes/082) —
   friend cadence is now AlarmManager-driven, no 30-fire ceiling.
5. **App-private-cache MediaStore write helper.** ~2 h. Closes the
   "album skipped" fallback on MIUI / ColorOS. Cosmetic on most
   devices.

---

## 8. How to tell which layer applied a wallpaper

For debugging when a user reports "the wrong wallpaper" or "no
wallpaper change," check `useMoodStore.history` (or the on-screen
history badge — Mood Home → time icon top-right). The `source`
field on each history entry is one of:

- `manual` — user tapped a mood card
- `notification` — daily / friend check-in tap
- `sleepwake` — sleep / wake notification tap OR foreground-handler
  auto-apply OR FGS auto-apply OR bg-fetch fallback
- `camera` — (currently disabled — change 039)
- `background` — bg-fetch context-mood inference

If `sleepwake` entries appear at the correct hour but the user says
the wallpaper didn't change visually, the apply itself failed —
check `adb logcat | grep -E "SleepWakeFgService|wallpaperActions"`.
