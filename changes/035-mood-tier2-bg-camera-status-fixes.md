# Mood — fix Tier 2 background firing, Vivo camera, status visibility

**Date:** 2026-05-17
**Type:** fix

## Problem

User report on the changes/034 build, verbatim:

> "i don't see any progress, camera detection doesn't happen, ui mismatch in
> the mood based page, i open app first i got notification, when i again open
> another app i didn't get any notification regarding mood, i don't know
> auto change bg work or not in every 60 minutes, what about daily mood
> prompt, and the 'when you open other app' is only in testing mode or this
> is live because i don't see anything happening without clicking test now —
> when i click i got notification, when i click any emoji wallpaper auto
> change"

Each complaint mapped to a real bug:

1. **Tier 2 only fires on Test Now, never automatically.** Root cause:
   `lib/moodBootstrap.ts` registered the OS background task ONLY when
   `backgroundEnabled` (Tier 4) was true. The user's flow was "I want Tier 2
   only" → nothing scheduled the OS to wake us up to poll UsageStats →
   nothing ever fired in background. `runUsageMonitorPass` already ran first
   inside the bg task, but the task itself wasn't registered.

2. **Camera detection doesn't happen.** Likely cause: the 96×128 CameraView
   at `opacity: 0.001` is still in the "too small / not visible" zone for
   the Vivo / OPPO / MIUI camera HAL — the green dot lights up but
   `takePictureAsync` returns black or hangs.

3. **"I don't know if bg works."** Real UX bug — every engine card had a
   toggle but NO indicator showing whether anything was actually running,
   when the last scan happened, or when the next is expected.

4. **"Got a notification when I first opened the app."** That was the
   already-scheduled daily prompt firing for the first time after install.
   Not a bug — just unannounced. Now the daily-prompt sub-row shows
   "Next: tomorrow at 8 AM · last response Xm ago" so the user can predict
   when notifications will fire.

## Solution

### Fix 1 — Bootstrap registers bg task on EITHER bg-related toggle

`lib/moodBootstrap.ts` initial sync now checks `backgroundEnabled ||
appOpenEnabled`. The subscriber's transition logic uses
`wasNeeded = prev.bg || prev.appOpen` / `isNeeded = state.bg || state.appOpen`
so the task is registered the first time EITHER flips on and unregistered
only when BOTH flip off. Same background task continues to run Tier 2's
usage monitor BEFORE the Tier 4 wallpaper-change pipeline (so even bg-off
users get app-open detections), exactly as 034 set up.

### Fix 2 — Foreground UsageStats polling while on Mood Home

New `useEffect` in `app/(tabs)/mood.tsx` runs `runUsageMonitorPass` every
60 s while:
- Mood Home is mounted (so polling stops the moment user navigates away)
- `appOpenEnabled` is true
- At least one target app is enabled

This is the path the user will test first. WorkManager / Background Fetch
can't fire more often than every ~15 min on Android — without foreground
polling, the user would think the feature is broken for the first 15+
minutes after enabling it. Foreground polling gives "tap toggle on, switch
to Instagram, switch back, see notification fire" within 60 s.

`tier2LastFiredAt` + `tier2LastChecked` are stored as local component state
(no persistence — re-evaluating after restart is cheap) and drive the live
status line under the Tier 2 chip row.

### Fix 3 — CameraView positioning that actually delivers frames

`components/MoodEngineHost.tsx` was iterating on "how do we hide a working
camera." Final answer: render at NORMAL preview size (240×320) and
translate it off-screen with `top: -10000, left: -10000`. The layout system
treats the view as fully present (so the camera2 surface is real and
preview frames flow), the GPU rasterises it (so `takePictureAsync` returns
actual pixels), but every fragment lands outside the screen bounds so the
user never sees anything.

Why each previous attempt failed (documented in the new code comment):

| Attempt | Why it failed |
|---|---|
| 1×1 + opacity:0 | Sub-min-preview-size on most OEMs → black frames |
| 96×128 + opacity:0.001 | Still tiny; some camera2 implementations short-circuit when surface is sub-128px |
| Any size + opacity:0 | Several Android camera2 stacks (Vivo notably) skip the preview pipeline entirely when the SurfaceView is invisible |

Translating off-screen avoids all three failure modes.

### Fix 4 — Status indicators on every card

`history` (already in the mood store) is mined for the most recent entry
per `source`:

- `lastCameraAt` = most recent camera-driven detection
- `lastBgAt` = most recent background-task detection
- `lastNotifAt` = most recent notification-response

Each engine card now shows a small muted-grey status line:

| Card | Status line |
|---|---|
| Mood Mode (Tier 1) | "Last camera scan 24s ago · next ~60s" / "Waiting for first scan…" |
| Auto-change in bg (Tier 4) | "Last bg run: 23m ago" |
| Daily mood prompt (Tier 3) | "Next: today/tomorrow at X · last response Xm ago" |
| When you open other apps (Tier 2) | "Watching · last check 30s ago" / "✓ Last prompt sent Xm ago" |

The user can now glance at the screen and tell, for each engine, whether
it's alive and when it last did something.

### Fix 5 — Honest copy

| Old copy | New copy |
|---|---|
| Tier 4: "Every 30–60 min" | "OS-decided cadence (typically 30 min – few hours)" |
| Tier 2: "Watches for Instagram, Gallery, WhatsApp, etc. and sends a 1-tap mood prompt" | "Polls every 60 s while this app is open · every 15–30 min in background (Android-only)" |

The Tier 2 line is the honest version: Android forbids real-time
foreground-app callbacks for third-party apps. The best we can do is poll.
Foreground polling is near-real-time (60 s). Background polling is delayed
(OS-controlled, typically 15–30 min). Now the UI says so.

## Files changed

- `lib/moodBootstrap.ts` — register bg task on either bg-related toggle
- `app/(tabs)/mood.tsx` — foreground UsageStats poll, three derived
  `lastXAt` timestamps, status lines under each card, two helpers
  (`timeAgo`, `nextDailyAt`), honest copy on Tier 2 / Tier 4 sub-rows,
  new `statusLine` style
- `components/MoodEngineHost.tsx` — CameraView at 240×320 translated
  to (-10000, -10000), full code-comment explaining why each previous
  positioning attempt failed
- `changes/035-mood-tier2-bg-camera-status-fixes.md` — this doc
- `changes/README.md` — index row

## Verification

1. `npx expo run:android --variant release` (JS-only changes — should
   incremental-build in ~2–4 min).
2. Open Mood tab.
3. **Tier 1 camera (Fix 3):** flip Mood Mode on. Within ~3 s the status
   should read "Waiting for first scan…", then within 60 s flip to "Last
   camera scan Xs ago" with a non-stub mood reflecting the actual room
   lighting (cover the lens → calm/sad; uncover in light → happy/excited).
4. **Tier 2 foreground polling (Fix 2):** flip "When you open other apps"
   on. Without leaving Mood Home, status reads "Watching · last check Xs
   ago". Switch to Instagram, come back to our app, wait ≤ 60 s →
   notification fires; status flips to "✓ Last prompt sent Xs ago".
5. **Tier 2 background (Fix 1):** force-quit the app. Open Instagram or
   Gallery. Lock phone. Wait 15–30 min. Notification should arrive without
   the app being open. (Requires Vivo battery-whitelist per changes/034
   Notes.)
6. **Status indicators (Fix 4):** every card with a toggle in the "on"
   position now shows live status. Pull-to-refresh on Mood Home is NOT
   wired — but `useEffect`s + the 60s poll mean values self-update.
7. **Honest copy (Fix 5):** Tier 4 sub-row body reads "OS-decided cadence
   (typically 30 min – few hours)". Tier 2 modeBody reads "Polls every 60 s
   while this app is open · every 15–30 min in background (Android-only)".

## Notes

- **Why not poll UsageStats from a non-Mood screen?** Because polling has
  cost (an IPC to system_server on each pass) and the user spends most of
  their time on Home / Gallery, not Mood. Foreground polling is bounded to
  the Mood tab specifically — when the user navigates away, the interval
  clears via the `useEffect` cleanup.
- **Why not persist `tier2LastFiredAt`?** It's local-component state because
  the only consumer is the on-screen status line; if the user closes Mood
  Home, the next time they reopen we re-derive everything from the
  persisted mood history. Persisting would be more memory/disk for no
  observable benefit.
- **Why not surface a "raw last detected app package" anywhere?** Because
  the Test Now button + the live status already cover "did detection
  happen recently." Showing the package name (`com.instagram.android`) is
  developer noise; the average user already knew they opened Instagram.
- **iOS unchanged.** Tier 2 is Android-only — `isUsageStatsAvailable`
  returns `false` on iOS, foreground polling silently no-ops, bg task no-ops,
  card UI still renders but the toggle alerts "Needs a native rebuild" /
  "Not available on iOS" if tapped.
- **Battery whitelist still required on Vivo for background Tier 2/4.**
  Re-stating the changes/034 Vivo note here so it's not lost:
  Settings → Battery → Manage app battery usage → Kawaii Baby Wallpapers →
  "Unrestricted". Without this, OriginOS terminates the WorkManager job
  within minutes regardless of any granted permission.
