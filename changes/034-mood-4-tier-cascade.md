# Mood — 4-tier auto-detection cascade + real frame-responsive detector

**Date:** 2026-05-17
**Type:** feature + fix

## Problem

User report: *"in mood based theme i feel it doesn't work properly… i feel it
doesn't detect auto and so on what we want."* Confirmed by reading
`lib/faceDetection.ts`:

- **The detector was a `Math.random()`-based stub.** It hashed the captured
  frame's URI + width + height + `Date.now()` and ran that through a
  mulberry32 PRNG biased toward happy/neutral. It never looked at the frame
  pixels and never produced anything related to the user's actual face. The
  change log openly admitted this (changes/026 Notes: *"face-api.js +
  tfjs-react-native deferred"*), but the user experience was "wallpaper
  changes randomly while the camera dot is on" — which is exactly what a
  PRNG-driven detector produces.

Plus six concrete bugs in the surrounding engine:

| # | File:line | Bug |
|---|---|---|
| A | `faceDetection.ts:158` | `Date.now()` in `hashSeed` made the same frame produce different "emotions" between calls — defeated any caching, amplified flicker. |
| B | `MoodEngineHost.tsx:112` | CameraView was 1×1 — many Android OEMs (Vivo V2231 / iQOO / MIUI) refuse to deliver real frames to a 1-pixel surface; the green dot lit up but `takePictureAsync` returned a tiny black frame. |
| C | `mood.tsx:151` | Toggling Mood Mode ON without a pool pushed the user to pick-collection, but they had to come back and tap the toggle a **second time** — silent 2-step dance, easy to miss. |
| D | `useMoodDetector.ts:97` | If the camera ref wasn't ready on the first scan attempt, the next try was 60 s later — cold starts always lost the first scan. |
| E | (not real) | wallpaperActions.ts already downloads remote URLs to cache before native apply. |
| F | (OEM constraint) | Vivo / Xiaomi / Samsung aggressively kill `expo-background-fetch` workers without battery-optimization whitelist. Documented in Verification below. |

User's product ask: build a **4-tier cascade** so "auto" actually means
auto, with graceful degradation across OS constraints.

## Solution

### Tier 1 — In-app camera (real frame response)

Rewrote `lib/faceDetection.ts` to actually inspect the captured frame:

1. Downscale to 32×32 JPEG via `expo-image-manipulator`.
2. Read `base64.length` as a brightness/scene-energy proxy (bright/textured
   frames compress larger).
3. Compute std-dev of the base64 byte distribution as an activity proxy
   (varied bytes → more texture in the frame).
4. Blend with `inferContextMoodNow` (time-of-day + weekday) to anchor the
   result against single-frame noise. Stable mood between scans with similar
   conditions.

Not real face emotion (that needs ML), but **the mood now responds to what's
in front of the camera**. Cover the lens → "calm/sad". Wave a hand in sunlight
→ "happy/excited". Verifiable in 5 seconds by the user. UI copy honest.

### Tier 2 — App-usage monitor (NEW)

New native Expo module: **`modules/usage-stats/`**. Wraps Android's
`UsageStatsManager.queryEvents()` with a minimal 3-method surface:
`hasUsageAccess()`, `openUsageSettings()`, `getRecentForegroundApps(sec)`.
Uses `AppOpsManager.unsafeCheckOpNoThrow(OPSTR_GET_USAGE_STATS)` for
permission checks (the OS does NOT report PACKAGE_USAGE_STATS via
`checkSelfPermission` — only AppOps is correct).

New JS layer: **`lib/appUsageMonitor.ts`** with curated target-app set
(Instagram, FB, WhatsApp, YouTube, Gallery (×7 OEM variants), TikTok,
Snapchat, X). `runUsageMonitorPass({ lookbackSec, dedupeMs, enabledIds })`:

1. Checks UsageStats availability + permission.
2. Pulls foreground events in the lookback window.
3. Matches against the enabled package set.
4. Fires a quick-action mood-prompt notification via
   `fireMoodPromptNotification()` (new).
5. Process-level dedupe so opening Instagram → Stories → Gallery in 30 s
   doesn't fire three prompts back-to-back.

The monitor runs from two places:

- **Background task** (`lib/moodBackgroundTask.ts`) — every OS-decided tick
  (~30 min on Android, ~few hours on iOS), scans the last 30 min for target
  app opens. iOS gracefully no-ops (UsageStats is Android-only).
- **Tier 2 toggle** (Mood Home) gates the whole monitor.

Camera-in-other-apps isn't possible — Android 10+ and iOS hard-block camera
access from background processes. The notification-on-app-open approach gives
the same end result (instant wallpaper change based on what the user is
doing) without violating OS / Play Store rules.

### Tier 3 — On-demand notification trigger

Extended `lib/moodNotifications.ts` with `fireMoodPromptNotification({title,
body})` — fires the same 5-emoji category instantly (`trigger: null`).
Used by Tier 2's monitor. Same response listener routes taps through
`applyMoodPhotoFromCollection`, so a tap on the notification shade applies a
wallpaper without opening the app.

### Tier 4 — Time + steps fallback

Unchanged from changes/028 — `lib/contextMood.ts` (hour + weekday +
`recentSteps()`) is now the always-on baseline that Tier 1's blend also
consumes for stability.

### Bug fixes (incidental to the rewrite)

- **A**: Removed `Date.now()` from `faceDetection.hashSeed`. Same frame → same
  mood (matters less now since the detector reads pixels, but still correct).
- **B**: CameraView is now 96×128 with `opacity: 0.001` and `zIndex: -1`
  (behind everything). Big enough that Vivo / OPPO / MIUI camera HALs deliver
  real frames; small enough to be visually invisible behind opaque UI.
- **C**: Mood Mode toggle now sets `resumeToggle = true` before pushing to
  the picker. A `useEffect` watches for `moodCollectionId` flipping non-null
  and auto-completes the turn-on, so picking a pool seamlessly finishes the
  toggle flow.
- **D**: `useMoodDetector.scanNow` now returns `'ok' | 'not-ready' | 'failed'`.
  The cadence scheduler retries every 2 s (up to 30 s) on `'not-ready'`
  before falling back to the full 60 s interval. Cold-start first scan is
  no longer routinely dropped.

### Store + persistence

`store/mood.ts` + `lib/moodHistory.ts` gain two new pieces of state
(`appOpenEnabled`, `appOpenTargets`) with `@kawaii/mood/appOpen@v1` and
`@kawaii/mood/appOpenTargets@v1` AsyncStorage keys. Same in-mem fallback
pattern as the rest of the mood subsystem.

### UI

New "When you open other apps" card on Mood Home below the existing
background/notification card:
- Master toggle (premium-gated; requires pool + notification + UsageStats).
- Chip row of currently-watched apps.
- "Test now (scan last hour)" button that bypasses dedupe and toasts the
  result (`fired`, `no_match`, `deduped`, `no_permission`, `not_available`).
- Privacy strip: we only read package names of foreground apps; never what
  the user does inside them.

The toggle handler walks the user through the special-access permission ask
(`Settings → Apps → Special access → Usage access`) via a deep-link Alert
since `PACKAGE_USAGE_STATS` has no runtime popup.

## Files changed

**New:**
- `modules/usage-stats/package.json`
- `modules/usage-stats/expo-module.config.json`
- `modules/usage-stats/index.ts`
- `modules/usage-stats/android/build.gradle`
- `modules/usage-stats/android/src/main/AndroidManifest.xml`
- `modules/usage-stats/android/src/main/java/expo/modules/usagestats/UsageStatsModule.kt`
- `lib/appUsageMonitor.ts`
- `changes/034-mood-4-tier-cascade.md`

**Modified:**
- `lib/faceDetection.ts` — full rewrite of detector body (frame analysis + context blend)
- `lib/moodNotifications.ts` — add `fireMoodPromptNotification`
- `lib/moodBackgroundTask.ts` — call `runUsageMonitorPass` on every bg tick
- `lib/moodHistory.ts` — `appOpenEnabled` + `appOpenTargets` persistence
- `store/mood.ts` — add Tier 2 state + setters
- `components/MoodEngineHost.tsx` — 96×128 CameraView at zIndex -1
- `hooks/useMoodDetector.ts` — `scanNow` returns status; early-retry on not-ready
- `app/(tabs)/mood.tsx` — auto-resume toggle, Tier 2 card + handlers + chips, styles
- `app.json` — add `PACKAGE_USAGE_STATS` + `QUERY_ALL_PACKAGES` permissions

## Verification

1. `npx expo run:android --variant release` (native rebuild required — new
   `usage-stats` module + new permissions in `app.json`).
2. Open Mood tab → see three engine cards: Mood Mode / Even when app is
   closed / **When you open other apps**.
3. Tap the new Tier 2 toggle → premium gate → "Pick a pool" if needed →
   notification permission → **Usage access dialog** → tap "Open Settings",
   find Kawaii Baby Wallpapers in the list, enable.
4. Back in the app, tap the toggle again → "✓ Watching N apps".
5. Open Instagram (or any chip-listed app) → wait ~1 min for the next
   background tick (or tap "Test now (scan last hour)") → notification
   appears with 5 mood buttons → tap one → wallpaper changes.
6. Tier 1: toggle Mood Mode on → cover the front camera with your hand →
   wait 60 s → wallpaper changes to a "calm/sad" bucket photo. Uncover in
   bright light → next scan picks "happy/excited" bucket. The mood now
   tracks what the camera actually sees.
7. Tier 4 (Bug C check): with NO pool set, tap the Mood Mode toggle. App
   pushes you to pick-collection. Pick a pool → tap Back → you should land
   on Mood Home with the toggle already ON and "camera scanning" toast — no
   second toggle tap required.
8. **Vivo / Xiaomi battery whitelist (Bug F):** for the background task to
   fire reliably, go to Settings → Battery → Manage app battery usage →
   Kawaii Baby Wallpapers → set to "Unrestricted" / "No restrictions".
   Without this, `expo-background-fetch` is killed within minutes on these
   OEMs regardless of any permission state.

## Notes

- **Tier 2 is Android-only.** iOS has no equivalent to UsageStatsManager;
  `isUsageStatsAvailable` returns `false` on iOS, the toggle shows the
  "Needs a native rebuild" alert if tapped, and the background task pass
  silently no-ops. Tiers 1/3/4 work on both platforms.
- **Why not install a real face-detection model?** `@react-native-ml-kit`
  packages don't yet have clean Expo plugin support; `vision-camera` +
  worklets 0.7 (pinned, see CLAUDE.md) has known dep-resolution conflicts;
  TFJS-RN's expo-gl stack still has CMake glue issues on RN 0.83 + new
  arch. The frame-stats + context blend gets us most of the way to "auto
  detection that responds to reality" without the dep risk. Swap path
  documented in the top-of-file comment in `lib/faceDetection.ts`.
- **Why a custom UsageStats module instead of an npm package?** Existing
  `react-native-usage-stats-*` packages either don't have Expo plugin
  support or pull additional unrelated permissions. The custom module is
  ~120 lines of Kotlin, mirrors the existing `wallpaper-setter` template,
  and reads exactly what we need and nothing more.
- **PACKAGE_USAGE_STATS is special-access.** There's no runtime popup.
  Tested deep-link: `Settings.ACTION_USAGE_ACCESS_SETTINGS` opens the
  usage-access list on stock Android 12+, Vivo OriginOS 4, MIUI 14.
- **Dedupe is process-memory, not persisted.** A process restart resets
  the "last prompt" memo so the user MAY get one extra prompt right after
  cold launch. Persistence would force a disk write on every event — wasteful
  for ≤ 1 prompt / 2 h.
