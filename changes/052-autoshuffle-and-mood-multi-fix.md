# Auto-shuffle FGS wiring + 4 mood-feature fixes

**Date:** 2026-05-18
**Type:** fix

## Problem

User-reported, multi-bug session. Direct quote (lightly cleaned):

1. **"I select gallery album from app/theme-pack/ and choose to shuffle every 5 min — it starts counting, then stops, and until I open the app it does NOT auto-change. I want auto-refresh in the custom time without me having to open the app."**
2. **"Friend notification: I only got 3 options to choose mood. I want all options to choose from. The notification also only triggers when I reopen the app after that time — otherwise I don't get it."**
3. **"Mood-based theme: I'm not able to select the album after once selecting it."**
4. **"Footstep walk day doesn't work properly."**
5. **"After subscribing, the subscription doesn't stop the shuffle, and not for mood-based either. It is totally different and should fix their working logic."**

## Solution

Five root causes, fixed individually. Note that change 051 *built* the
native Android foreground service but never *wired* it into autolinking,
so it was dead code in every binary. The mood picker bug masqueraded as a
UI bug but was actually a mutual-exclusivity subscriber tearing down the
feature on every re-selection.

### 1. Autolink `modules/shuffle-foreground` (THE shuffle root cause)

The native FGS shipped in change 051 was never declared as a dependency,
not symlinked into `node_modules`, and absent from the generated
autolinking artifacts (`android/app/build/generated/autolinking/`). So
`requireOptionalNativeModule('ShuffleForeground')` returned `null`,
`isShuffleForegroundAvailable === false`, and JS silently fell back to
`expo-background-fetch` — which OEMs (Vivo OriginOS, MIUI, ColorOS,
HyperOS) silently throttle to nothing. **This is the entire reason the
5-minute timer "stops" when the app is closed: it never starts.**

Fix: add `"shuffle-foreground": "file:./modules/shuffle-foreground"` to
`package.json` dependencies. Expo Modules autolinking discovers local
file: deps via the standard `node_modules` scan during build. Requires
`npm install --legacy-peer-deps` followed by `npx expo run:android` to
land in the APK.

### 2. Mood collection picker re-selection (the "can't change album" bug)

`app/mood/pick-collection.tsx:onPick` called `activateBuiltinPack`, which
sets the pack as the *Shuffle* active collection. That flip trips the
mutual-exclusion subscriber in `lib/moodBootstrap.ts:226-231` which
disables `backgroundEnabled` on the mood store. From the user's side:
"I picked album B but my mood-mode is off again — the picker is broken."
Actually the pick succeeded; the mutual exclusion killed the feature in
the same frame.

Fix: the mood picker now uses `ensureBuiltinPackCollection` (already on
the store at `store/shuffle.ts:249`). Same materialization, but does
NOT touch `activeCollectionId`. Shuffle's active pointer stays clean,
mood-bg subscriber doesn't fire, the album swap is silent and correct.

### 3. Decouple `isPremium` from runtime engine gates

`lib/moodBackgroundTask.ts:runMoodBackgroundOnce` had two `isPremium`
checks (Sleep/Wake fallback + the master gate). If the user enabled a
feature while premium, then later premium flipped off (subscription
lapse, dev-only toggle, etc.), the **already-running** engine stopped on
the next OS dispatch. That contradicts the user expectation: subscription
is the entry gate (gatePremium at toggle-on), not a per-tick run gate.

Fix: drop both runtime `isPremium` checks. `gatePremium()` already filters
who can *enable* each feature in `app/(tabs)/mood.tsx`. Once a feature is
on, it stays on until the user turns it off. Shuffle never had this gate
at all (correct — free user with one pack can shuffle).

### 4. Surface step-count status on Background-mode toggle

User: "footstep walk day doesn't work properly." Root cause was silent
failure — `lib/stepCount.ts:recentSteps()` returns `null` for any of:
sensor unavailable, motion permission denied, native bridge not linked.
The bg-task accepts `null` and falls back to time-of-day, so the feature
"works" but never uses steps and the user has no idea why.

Fix: new `getStepStatus()` returns a discriminated union (`'available'`
/ `'no-permission'` / `'unsupported'` / `'unlinked'`).
`onToggleBackground` in `app/(tabs)/mood.tsx` probes it after the
permission request and toasts the result in plain language, e.g.
`"✓ Background mood on — runs every 30–60 min · steps tracking"` or
`"✓ Background mood on — runs every 30–60 min · steps OFF (motion
permission denied)"`. No silent degradation.

### 5. Add Shuffle CTA to `app/theme-pack/[id].tsx`

User reported "I select gallery album from app/theme-pack/" but that
screen was a read-only grid with no shuffle action — the user had to
backtrack through `app/wallpapers/theme-packs.tsx` to start one. Wrong
entry point for the most common task on this screen.

Fix: primary "Start auto-shuffle" pill at the top of the screen opens a
`premiumAlert` with the four free-tier intervals (1h / 6h / 12h / 24h)
and three premium ones (15m / 30m / Custom). Tapping a preset calls
`activateBuiltinPack` (this time we DO want to activate as shuffle —
that's the user's stated intent on this screen), patches `timerId`, and
fires `applyCollectionPhoto` at index 0 for instant feedback. The
existing bootstrap subscriber picks up the activation and starts the
native FGS for ongoing rotation. While running, the button morphs to
`Auto-shuffle · Every Nh` with a stop button beside it.

### 6. Honest non-fixes

- **"Only 3 mood buttons in the notification":** All 7 moods ARE sent
  (verified at `lib/moodNotifications.ts:166`,
  `constants/moods.ts:141` lists 7). Android collapses the notification
  shade to 2-3 visible buttons; expanding the notification shows the
  rest. Not a JS-fixable UX.
- **"Notification only fires on app reopen":** The notification IS
  scheduled at the OS level via `scheduleNotificationAsync` and DOES
  fire while the app is closed. What happens "on reopen" is the
  wallpaper finally applying — because the apply runs in the response
  handler, which only fires when the user **taps** the notification.
  If the user just looks at the banner and doesn't tap, no wallpaper
  change happens. That's intentional (taps = consent to wallpaper
  change). The bg-task auto-apply path is a separate feature
  (Background mood), and the recent isPremium decoupling above should
  fix the "I subscribed but it stopped working" subset of this report.
- **iOS shuffle:** Apple forbids programmatic wallpaper change. JS
  records history and deep-links to Photos.app; no further work
  possible on that platform.
- **Mutual exclusion (theme pack ↔ mood):** Already correctly wired in
  `lib/moodBootstrap.ts:130-150` (mood-bg ON → shuffle stops) and
  `:226-231` (shuffle activates → mood-bg stops). Sleep/Wake stays
  independent as the user requested. Left unchanged.

## Files changed

- `package.json` — add local `shuffle-foreground` file: dep so Expo
  Modules autolinking includes the native FGS in the APK
- `lib/moodBackgroundTask.ts` — drop runtime `isPremium` gates from
  `runMoodBackgroundOnce`; clean up the unused `useSettingsStore`
  import (keeps `hydrateSettingsStore` because the bg-task still
  hydrates so other code reading settings sees persisted state)
- `app/mood/pick-collection.tsx` — switch `onPick` from
  `activateBuiltinPack` to `ensureBuiltinPackCollection` so picking
  doesn't trip the mutual-exclusion subscriber
- `lib/stepCount.ts` — new `getStepStatus()` + `StepStatus` type for
  surfacing the four real failure modes
- `app/(tabs)/mood.tsx` — `onToggleBackground` now probes step status
  and toasts what the user can expect; no silent degradation
- `app/theme-pack/[id].tsx` — add primary Start-auto-shuffle CTA +
  stop button; reuse `applyCollectionPhoto` for instant feedback
- `changes/README.md` — index row (added separately)

## Verification

The autolink fix REQUIRES a native rebuild:

```powershell
npm install --legacy-peer-deps
npx expo run:android
```

After the rebuild, on the device:

1. Open any theme pack from Home → tap **Start auto-shuffle** → pick
   `15 min`. Wallpaper should change immediately. Force-close the app.
   Wait 15+ minutes. Wallpaper should change again WITHOUT opening the
   app. Pull down notifications — you should see the ongoing
   `Auto-shuffle running` notification at the bottom.
2. Mood tab → tap the Pool row → pick Pack A → back. Tap Pool row
   again → pick Pack B. Background-mood toggle should stay where it
   was (was ON → stays ON, was OFF → stays OFF). Before this fix,
   re-picking would silently flip it to OFF.
3. Mood tab → toggle Background mood ON. Toast should reveal the
   step-tracking state explicitly. If the device lacks a pedometer,
   the toast says so instead of pretending steps work.
4. Settings → toggle premium OFF mid-session while Background mood is
   running. Open the app later — Background mood should still be on
   and still applying. Before this fix, an OS dispatch with
   isPremium=false would return early and stop the engine.

## Notes

- The `shuffle-foreground` autolinking change is the single highest-impact
  fix in this batch and is what change 051 implicitly assumed but never
  declared. Future native modules under `modules/` must add a
  matching `"<name>": "file:./modules/<name>"` line to `package.json`,
  or they'll quietly behave the same way (compile fine, never load).
- iOS continues to be a degraded experience — that's a platform
  limitation, not something we'll close.
- "10 mood options" in the user's brief was an over-count; the data
  layer ships 7. Two non-detectable moods (`disgusted`, `fearful` from
  face-api.js) fold into `angry` / `neutral` respectively. If we ever
  add more moods, they'd flow through both `NOTIFICATION_MOOD_IDS` and
  `MOODS` in `constants/moods.ts` together.
