# Mood Mode — redesign as global auto-shuffle engine

**Date:** 2026-05-16
**Type:** feature (replaces 026 architecture)

## Problem

Changes/026 shipped a screen-bound mood feature: open Mood tab → tap emoji
or run camera → browse a grid → tap a wallpaper to apply. Real product
intent (clarified by the user): **mood should drive auto-shuffle**. User
picks a Collection once; mood is detected continuously while the app is
open; wallpaper auto-changes to a photo from that Collection that matches
the detected mood. The 026 build did none of that — manual emojis didn't
apply wallpapers, the camera screen wasn't connected to the wallpaper
pipeline, and there was no concept of a "mood pool".

## Solution

Refactored from "mood screen" into "mood engine" — a headless host mounted
at the app root that owns a hidden 1×1 front CameraView and auto-applies
wallpapers as mood changes. Reuses 100% of the existing auto-shuffle plumbing
(`Collection`, `applyCollectionPhoto`, shuffle history, `setAsWallpaper`).

**Engine** (`components/MoodEngineHost.tsx`):
- Mounts in `app/_layout.tsx` alongside `ShuffleEngineHost`.
- Gated on `isPremium && moodModeEnabled && moodCollectionId && CameraView`.
  When any precondition flips false, returns `null` → CameraView unmounts
  → OS "camera in use" indicator disappears → zero battery cost.
- Hosts a 1×1 invisible CameraView in the corner and runs
  `useMoodDetector(cameraRef, true)`.
- On every mood transition (de-duped via `lastAppliedMoodRef`):
  → `applyMoodPhotoFromCollection(mood, collectionId, currentPhotoId)`.
- Resets the dedupe ref when the active Collection changes so switching
  pools triggers an immediate apply.

**Hash-bucketing** (`lib/moodBucket.ts`):
- `getMoodBucket(photoId)` — djb2 hash → MoodId. Stable, uniform across
  collections of any size, no manual tagging required.
- `pickPhotoForMood(photoIds, mood, exclude)` — prefers the matching
  bucket, falls back to any photo when bucket is empty, avoids the photo
  already applied.
- `tallyMoodBuckets(photoIds)` — 7-mood histogram surfaced in the pool
  picker AND the Mood Home so the user sees pool balance at a glance.

**Engine action** (`lib/moodEngineActions.ts`):
- `applyMoodPhotoFromCollection(mood, collectionId, currentPhotoId)` —
  resolves Collection → picks photo via bucket → routes through existing
  `applyCollectionPhoto()` (which sets the wallpaper natively AND writes
  to shuffle history). Returns `{ ok, message, photoId }` so the caller
  can mirror "currently applied" into the mood store.

**Imperative camera permission** (`lib/cameraPermission.ts`):
- `getCameraPermission()` / `requestCameraPermission()` — non-hook helpers
  so the Mood Mode toggle's `onPress` can request permission without
  navigating to a CameraView-mounting screen. Lazy-required, safe when
  expo-camera isn't linked yet.

**Store** (`store/mood.ts`):
- Adds `moodModeEnabled`, `moodCollectionId`, `currentPhotoId` + actions.
- Boot hydration loads all three from AsyncStorage alongside history.
- Manual emoji selection (`selectMoodManual`) now records source as
  `manual`; engine-driven detections (`reportCameraMood`) record as
  `camera`. Both feed the same history list.

**Persistence** (`lib/moodHistory.ts`):
- Three new keys: `…/mode@v1`, `…/collection@v1`, `…/currentPhoto@v1`.
- Runtime-aware fallback unchanged — first failing AsyncStorage call flips
  the module to in-memory mode for the session.

**Mood Home rewrite** (`app/(tabs)/mood.tsx`):
- New "MOOD MODE" card: pill toggle, active pool with thumb, 7-mood
  balance bar, live "Detected: Happy 92%" row, currently-applied photo,
  privacy strip.
- Manual emoji row stays but is repurposed: force-applies a wallpaper
  from the active pool's bucket if a pool exists, else navigates to the
  mood preview grid.
- "Browse mood packs" horizontal scroll for mood-themed thumbnail tiles.

**Pool picker** (`app/mood/pick-collection.tsx`) — new route:
- Lists user collections + built-in theme packs.
- Each row shows hero thumb, photo count, and the 7-mood tally so the
  user picks a pool with good mood coverage.
- Tapping a built-in pack auto-activates it via the existing
  `activateBuiltinPack()`.

**Camera screen** (`app/mood/camera.tsx`) — repurposed:
- Was a CameraView-mounting screen → now a "Live View" status screen
  with NO CameraView (would have deadlocked with the global engine's
  CameraView; only one process can own the camera on Android).
- Shows current mood hero, confidence meter, active pool, applied photo,
  privacy strip, and Start / Stop / Refresh-now controls.

**Layout** (`app/_layout.tsx`):
- Mounts `<MoodEngineHost />` next to `<ShuffleEngineHost />`.
- Registers `mood/pick-collection` route.

## Files changed

New:
- `components/MoodEngineHost.tsx`
- `lib/moodBucket.ts`
- `lib/moodEngineActions.ts`
- `lib/cameraPermission.ts`
- `app/mood/pick-collection.tsx`

Modified:
- `app/_layout.tsx` — mount engine, register route
- `app/(tabs)/mood.tsx` — full rewrite for Mood Mode flow
- `app/mood/camera.tsx` — repurposed as Live View status (no CameraView)
- `store/mood.ts` — add mode/collection/currentPhoto state
- `lib/moodHistory.ts` — three new persistence keys + helpers
- `MOOD_ARCHITECTURE.md` — full v2 rewrite
- `changes/README.md` — index entry

## Verification

1. `npx expo run:android` to native-link expo-camera + AsyncStorage
2. Open Mood tab — see new "Mood Mode" card with toggle (off)
3. Tap toggle → paywall (dev-upgrade) → permission prompt → "Pick a pool" toast
4. Tap pool row → pick a theme pack → back to Home, pool card now filled
5. Tap toggle again → "Mood Mode on · scanning every 60s"
6. Wait 60 s — wallpaper changes; "Currently applied" thumb updates
7. Change to a different pool → wallpaper changes immediately
8. Tap a manual emoji → wallpaper applies from that mood's bucket
9. Force-quit, relaunch → mode + pool + applied photo all rehydrate
10. Toggle off → OS camera indicator disappears

Full 20-item checklist in `MOOD_ARCHITECTURE.md` §11.

## Notes

- **Why a global hidden CameraView vs an Active screen.** User explicitly
  picked "global — camera always on while app is open" over the Active
  screen alternative. Implemented honestly: the OS camera indicator stays
  on the whole time, and the toggle copy / privacy strip both disclose
  this. The engine returns `null` and unmounts the CameraView the instant
  any precondition flips false.
- **Background camera is impossible.** Android 10+ and iOS forbid camera
  reads from backgrounded processes for privacy. The engine uses
  `useMoodDetector`'s AppState-aware cadence and pauses cleanly when the
  app backgrounds; resumes on foreground. The wallpaper *itself* stays
  applied on the lock screen regardless.
- **Two "currently applied" mirrors are intentional.** `shuffleStore.history`
  is the system of record (drives the existing Active screen). `moodStore.
  currentPhotoId` survives shuffle's 30-entry rollover so Mood Home can
  show the mood-specific current even when shuffle history has rolled over.
- **No second CameraView anywhere.** The repurposed `mood/camera.tsx` Live
  View screen reads state from the store and never mounts a CameraView —
  having two would deadlock the device camera.
- The deprecated 026 manual-only Mood Home + camera-screen design is fully
  superseded by this change. No 026 code paths remain unreferenced.
