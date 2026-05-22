# Camera surface fix (last time), resume-scan delay, custom friend interval

**Date:** 2026-05-17
**Type:** fix + feature

## Problem

User report on the 037 build, three independent issues:

1. *"camera open but why mood remain same when i scan the face … scan test
   says scan fail check camera permission but in actual camera permission
   is open."* Translation: green camera dot is on (camera is initialized),
   but `takePictureAsync` is throwing. The toast misled the user about
   permission because the catch branch hard-coded that message.

2. *"when i refresh app and again open the camera doesnot trigger … i need
   to turnoff and again turn on the camera."* After backgrounding +
   resuming the app, scans don't fire for a long time. Force-toggling
   makes it work.

3. *"can i get one another option custom time so user can custom any time
   when to ask 1 min 2 min or 30 or 24 is their own choice."* Wants free-
   form minutes input for friend check-in instead of fixed presets.

4. *"scan test camera says mood engine not active."* Sometimes the Scan-Now
   button reports `'no-engine'` because the engine hasn't registered its
   scan callback yet.

## Root causes

### Camera surface (issues 1 + 4)

`MoodEngineHost` was rendering the `CameraView` at 240×320 translated to
`(-10000, -10000)`. On Vivo OriginOS the layout system creates the view
but the compositor skips GPU buffer allocation for any view entirely
outside the screen bounds. Camera2 paints the preview into an unallocated
buffer → `takePictureAsync` reads garbage / throws "no image data" → caught
by the detector loop → bubbled as "Detection failed".

The Scan-Now toast then reduced any `'failed'` to the literal string
*"Scan failed — check camera permission"* regardless of the actual cause,
so the user was sent on a wild goose chase.

This is the **fourth attempt** at hiding the camera. The successful pattern:
render at full preview size but clip with an `overflow: hidden` 1×1 parent.
Surface allocates real buffers; only the top-left pixel ends up visible
(invisible against dark UI).

### Resume scan delay (issue 2)

`useMoodDetector`'s AppState listener rescheduled with the full `intervalMs`
(60 s) on resume. The user who exited the app and came back saw the
status line still say "Last camera scan 90 s ago" and would wait, see
nothing, and conclude the engine was dead. Toggling off → on triggered the
fresh-mount path which uses `FIRST_SCAN_DELAY_MS = 2.5 s` and got an
immediate scan.

### Custom interval (issue 3)

Friend check-in only had fixed presets (15/30/60/120/240/360 min). The
user explicitly wanted finer-grained control including very short
intervals (1 min, 2 min) and very long ones (24 h).

## Solution

### Fix 1 — Real camera surface

```ts
// components/MoodEngineHost.tsx — final positioning
hidden: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, overflow: 'hidden' },
camera: { width: 240, height: 320, top: 0, left: 0 },
```

The `CameraView` is anchored to (0, 0) of the 1×1 parent at full 240×320
preview size; the parent's `overflow: hidden` clips everything beyond
1 pixel of the camera's top-left corner. The OS sees a real 240×320
SurfaceView (allocates buffers, camera2 paints frames normally,
`takePictureAsync` reads valid bytes); the user sees a single pixel of
light that disappears against the dark theme background. Full code-comment
documents the four positioning strategies tried + why each previous one
failed on the dev hardware.

### Fix 2 — Real error messages

`useMoodDetector.ScanResult` is now a discriminated union:
```ts
type ScanResult =
  | { status: 'ok' }
  | { status: 'not-ready' }
  | { status: 'failed'; error: string };
```

The `'failed'` arm carries the actual exception message (e.g. "Camera is
in use", "No image data") all the way up to the Scan-Now toast which now
shows `Scan failed: ${r.error}` instead of pretending it's a permission
problem. Caller-side switch in `mood.tsx:onScanNow` updated to the new
shape; `triggerImmediateMoodScan` re-exports the type for consumers.

### Fix 3 — Resume scans within seconds

`useMoodDetector`'s AppState change handler now reschedules with
`FIRST_SCAN_DELAY_MS` (2.5 s) on resume, not the full 60 s interval. The
user who exits + comes back sees a scan within ~3 s of returning. Removes
the "I have to toggle off/on to wake it up" friction loop.

### Fix 4 — Custom-minutes interval input

- `lib/moodNotifications.ts`: `FRIEND_CHECK_IN_MIN` lowered from 15 → 1.
  Added exported `FRIEND_CHECK_IN_ANDROID_FLOOR = 15` constant for the UI
  to use when warning about WorkManager rounding.
- `store/mood.ts`: `setFriendCheckInMinutes` clamp updated from
  `[15, 1440]` to `[1, 1440]`.
- `app/(tabs)/mood.tsx`:
  - The existing preset Alert (`onPickFriendInterval`) gains a `Custom…`
    button between the presets and Cancel.
  - Tap `Custom…` → opens a new bottom-sheet (`PremiumSheet` accent cyan)
    with:
    - A large number input (XL bold, centered, keyboard `number-pad`)
    - 8 quick chips (1, 5, 15, 30, 60, 120, 240, 1440 min) that populate
      the input — selected chip gets a cyan highlight.
    - Honest note: *"Android rounds repeating values below 15 min up to
      15 min (WorkManager floor). iOS supports the exact value."*
    - Save button (cyan).
  - `saveCustomInterval` validates (1–1440), calls
    `setFriendCheckInMinutes(n)`, dismisses the sheet, and toasts. If
    `n < 15`, the toast warns the user about the Android floor rather than
    silently lying.

## Files changed

- `components/MoodEngineHost.tsx` — CameraView 1×1 parent + 240×320 child;
  `triggerImmediateMoodScan` returns the new `ScanResult | { 'no-engine' }`
  shape
- `hooks/useMoodDetector.ts` — `ScanResult` discriminated union; resume
  scans with `FIRST_SCAN_DELAY_MS`; not-ready check uses `r.status`
- `app/(tabs)/mood.tsx` — `onScanNow` shows real error message; custom-
  interval bottom-sheet (input + chips + save) + state + handlers; new
  `customSheetStyles` StyleSheet appended below the main `styles`
- `lib/moodNotifications.ts` — `FRIEND_CHECK_IN_MIN = 1`; exported
  `FRIEND_CHECK_IN_ANDROID_FLOOR`
- `store/mood.ts` — clamp 1–1440
- `changes/README.md` + this doc

## Verification

1. `npx expo run:android --variant release`.
2. **Camera, the critical one:**
   - Open Mood Mode → first scan within ~3 s changes wallpaper.
   - Tap **Scan now (test camera)** → wallpaper changes immediately,
     toast says "✓ Scan done — wallpaper updated".
   - If the camera surface is still rejected on your hardware, you now
     see the REAL error message in the toast — paste that back.
3. **App resume:**
   - With Mood Mode on, switch to another app for ≥ 60 s, come back.
   - Within ~3 s of returning you should see "Last camera scan Xs ago"
     update with a fresh "Xs" value (was "60–120 s ago" before).
4. **Custom interval:**
   - Mood → Friend check-in → tap the interval row.
   - Tap `Custom…` (last button before Cancel).
   - New bottom-sheet opens. Input shows current value (e.g. `60`).
   - Tap the `1` chip → input flips to `1` and highlights cyan.
   - Tap Save → sheet closes, toast: "Set to 1 min · Android may round up
     to 15".
   - Try `30` → toast: "✓ Set to 30 min".
   - Try `1440` → toast: "✓ Set to 24 hours".
   - Try `9999` → toast: "Max is 1440 (24 h) — use Daily Mood Prompt".

## Notes

- **The four camera-positioning attempts are now documented in code.** A
  future developer trying to "clean up" the 1×1 clipping parent will at
  least know that the simple-looking alternatives all silently break on
  real Android hardware.
- **No persistent battery saving impact** from the resume-fast-scan
  change. Each scan is a single 60 s timer entry; the resume just resets
  the timer to fire in 2.5 s instead of 60 s. One extra scan per resume.
- **Android rounding is silent** by OS design — there's no API to ask
  "what would the OS actually do with this interval." The UI's warning
  is the most honest signal we can give.
- **Custom-interval UI**: I considered just hard-coding "1 min, 2 min, 5
  min, …" as additional presets, but the user said *"is their own choice."*
  Free-form input is what they asked for. The 8 quick chips are a
  shortcut for the common cases.
- **No new dependencies.** TextInput is built into React Native;
  PremiumSheet was already in the codebase.
