# Mood-Based Wallpaper Feature

**Date:** 2026-05-16
**Type:** feature

## Problem

App's existing `(tabs)/mood.tsx` was a simple chip-filtered grid using a
6-mood catalog with categories that didn't match the product spec
(`romantic`, `focused`, `dreamy`, `cozy`). The spec calls for a full
two-mode mood system — manual emoji picker (free) and camera-driven face
detection (premium) — with mood history, mood-mapped wallpaper packs,
privacy guarantees, and a paywall gate.

## Solution

Built the feature end-to-end as a self-contained subsystem layered on the
existing premium/theme/favorites infrastructure.

**Mood domain** (`constants/moods.ts`):
- 7 canonical moods (happy/sad/angry/calm/excited/surprised/neutral) with
  emoji, gradient, tint, tagline, and per-mood `picsum.photos` seeds.
- `MANUAL_MOOD_IDS` exposes only the 5 spec'd buttons for the free picker.
- `emotionToMood(emotion)` collapses the 7 face-api.js emotion labels
  (+ disgusted) into the 7-mood canonical set.

**Detection pipeline:**
- `lib/faceDetection.ts` — adapter with the face-api.js API surface
  (`loadFaceModels`, `detectEmotion`). Heuristic stub today, swap-in
  comments document the real install path.
- `hooks/useMoodDetector.ts` — 60 s cadence scan loop with AppState pause,
  scan-in-flight mutex, first-scan delay, error/no-face/low-light states.

**Persistence** (`lib/moodHistory.ts`):
- AsyncStorage backed (`@kawaii/mood/history@v1`, `…/last@v1`).
- Lazy-requires the native module so the manual feature works even before
  rebuild. Falls back to in-memory ring buffer if not linked.
- 60-entry cap, 4-min same-mood-dedupe so the 60 s camera loop doesn't
  flood the log.

**State** (`store/mood.ts`):
- Zustand store mirrors the persisted history, exposes `currentMood`,
  `lastConfidence`, `lastSource`, `cameraActive`. Hydrates on first mount.

**UI components:**
- `MoodEmojiButton` — memo'd glass button with reanimated gradient
  fade-in + emoji spring on select.
- `MoodConfidenceMeter` — animated "Happy 92%" bar with optional pulse.

**Screens:**
- `app/(tabs)/mood.tsx` — rewritten. Hero card, 5 emoji buttons, premium
  camera CTA, privacy strip, mood-pack preview row, history button with
  unread dot.
- `app/mood/camera.tsx` — full premium camera UX: lazy-required
  expo-camera, permission flow (incl. Settings deep-link), pulsing scan
  ring, model-warmup overlay, live meter, no-face/low-light/error banners,
  Scan Now + See Wallpapers actions.
- `app/mood/[id].tsx` — 2-col mood-filtered grid with chip switcher.
- `app/mood/history.tsx` — 7-mood tally + chronological rows with
  Manual/Camera source pills and confidence percentage.

**Config:**
- `expo-camera` + `@react-native-async-storage/async-storage` added to
  package.json.
- `app.json` gains the `expo-camera` plugin with the privacy-explicit
  `cameraPermission` string, plus the `CAMERA` Android permission.
- Three new routes (`mood/camera`, `mood/[id]`, `mood/history`) registered
  in `app/_layout.tsx`.

**Premium gate:**
- Reuses the existing `gatePremium()` from `components/PremiumLock.tsx`
  against `settings.isPremium`. Camera CTA goes through it; manual stays
  free. The phase-2 swap to RevenueCat (entitlement key `"premium"`) is
  a one-place change in `PremiumLock.tsx`.

## Files changed

- `package.json` — add `expo-camera@~17.0.8`, `@react-native-async-storage/async-storage@2.1.2`
- `app.json` — `expo-camera` plugin + Android `CAMERA` permission
- `app/_layout.tsx` — register `mood/camera`, `mood/[id]`, `mood/history`
- `app/(tabs)/mood.tsx` — full rewrite (new Home screen)
- `app/mood/camera.tsx` — new (camera + face detection)
- `app/mood/[id].tsx` — new (mood-filtered grid)
- `app/mood/history.tsx` — new (history + tally)
- `constants/moods.ts` — new (7-mood catalog + emotion mapping)
- `lib/faceDetection.ts` — new (face-api.js adapter)
- `lib/moodHistory.ts` — new (AsyncStorage persistence)
- `store/mood.ts` — new (Zustand mood store)
- `hooks/useMoodDetector.ts` — new (60 s scan loop)
- `components/MoodEmojiButton.tsx` — new
- `components/MoodConfidenceMeter.tsx` — new
- `MOOD_ARCHITECTURE.md` — new (full architecture + test checklist)

## Verification

1. `npm install --legacy-peer-deps`
2. `npx expo run:android` (native deps require a fresh build)
3. Open the Mood tab → tap each of the 5 emojis → hero updates instantly
4. Force-quit, relaunch → last mood persists
5. Tap "Auto-match my mood" → paywall alert → Upgrade (dev) → camera opens
6. Grant camera permission → model overlay → first scan ~2.5 s later → mood
   updates with confidence %
7. Wait 60 s → second scan fires; history grows
8. Tap history button → tally + chronological rows
9. Tap a history row → mood grid for that mood
10. See the full 20-item test list in `MOOD_ARCHITECTURE.md` §8

## Notes

- **react-native-camera → expo-camera.** Spec named `react-native-camera`,
  which is deprecated. Substituted `expo-camera` (the active fork by
  Expo) — same UX, supported, already aligned with the project's Expo
  bare-workflow setup.
- **face-api.js + tfjs-react-native deferred.** TFJS-RN doesn't yet have
  a clean install path on RN 0.83 + new architecture + worklets 0.7
  (our pinned dep chain — see CLAUDE.md). Built the adapter with the real
  API surface and a heuristic detector so the UI flow can be exercised
  end-to-end today; swap-in steps + per-function `// REAL:` comments are
  in `lib/faceDetection.ts`.
- **RevenueCat already stubbed.** The project's `isPremium` settings flag
  stands in for the `"premium"` entitlement (changes/021 set this up).
  Same call sites work when RevenueCat lands.
- **AsyncStorage fallback.** First launch after `npm install` will run in
  in-memory mode until `expo run:android` rebuilds the native bridge.
  Manual mode still works; history just doesn't persist across launches
  during that window.
- The shuffle hub's existing styling vocabulary (gradient CTAs, pill
  chips, `AnimatedButton`, `expo-image`, `Glass`, `gatePremium`) is
  reused verbatim — nothing in the mood feature requires bespoke UI
  primitives.
