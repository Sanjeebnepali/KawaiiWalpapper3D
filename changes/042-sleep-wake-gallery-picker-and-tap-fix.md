# Sleep/Wake — fix tap-doesn't-register + add phone gallery picker

**Date:** 2026-05-17
**Type:** fix + feature

## Problem

User report on the 041 build:

> *"it open to choose the photo but i can't able to choose photo for
> wakeup and sleep and additionally we can add own phone gallery photo
> can you add this also in the choose photo."*

Two issues:

1. **Tap-to-select didn't register** on the custom-pair picker's photo
   grid. User saw the grid but tapping a photo did nothing.
2. **Want to pick from phone gallery**, not only our curated mock pool.

## Root cause #1 — tap not registering

The grid cells used `AnimatedButton`. That wraps `Pressable` in
`Animated.createAnimatedComponent` so press-scale can run on the
worklet bridge. Inside `@gorhom/bottom-sheet`'s `BottomSheetScrollView`,
the bottom-sheet's pan gesture handler claims the touch ahead of the
Pressable when the touch target is wrapped in an animated component —
the tap registers as the start of a scroll instead of a press, and the
Pressable's `onPress` never fires.

`SimpleButton` (a plain `Pressable` with opacity press feedback, no
Reanimated wrapper) doesn't have this problem because the gesture
handler sees a regular RN Pressable and lets the press through.
changes/032 already documented this pattern for grid cells.

Bonus issue spotted while fixing: `width: '31.5%'` + `aspectRatio: 3/4`
inside a flex-wrap container nested in `BottomSheetScrollView`
sometimes produces unstable measured widths on Android. Fixed by
computing cell width from `useWindowDimensions()` and applying explicit
pixel `width` + `height` instead of percent + aspect.

## Solution

### Tap fix

- Replaced `AnimatedButton` → `SimpleButton` for each photo cell in the
  custom-pair grid.
- Added `customCellWidth = floor((screenWidth − 32 − 2*6) / 3)` memo (32
  is the bottom-sheet's horizontal padding, 6 is the grid gap). Applied
  inline as `width: customCellWidth, height: customCellWidth * (4/3)`.

### Phone gallery picker

- `npm install --legacy-peer-deps expo-image-picker` — adds
  `expo-image-picker@^55.0.20`.
- `app.json` adds the plugin block with `photosPermission` rationale.
- New `lib/galleryPicker.ts` — thin lazy-required wrapper around
  `launchImageLibraryAsync`. Returns `{ok, uri, reason}` with explicit
  branches for cancel / denied / module_missing / failed. Handles the
  `MediaTypeOptions.Images` vs new `MediaType.Images` API rename that
  expo-image-picker shipped between SDK 50 and 53.
- New "Pick from your phone gallery" button at the top of the
  custom-pair picker (cyan rounded pill, image icon). Above the
  "or pick from below" divider + curated photo grid.
- Handler `onPickFromGallery`:
  - Lazy-requires expo-image-picker via the wrapper
  - Requests photo permission (denied → premium-alert deep-link to Settings)
  - Opens system gallery
  - If returned URI:
    - Wake empty + Sleep filled → auto-fills Wake (no extra tap)
    - Sleep empty + Wake filled → auto-fills Sleep (no extra tap)
    - Both empty OR both filled → premium-alert asks "Use as ☀️ Wake or 🌙 Sleep?"
  - Toasts confirm

### URI-as-ID plumbing

The custom slot IDs were previously assumed to be catalog IDs (resolved
via `getPhotoById`). Gallery IDs are `file://...` URIs that aren't in
the catalog. Updated three sites:

1. **`lib/wallpaperActions.ts downloadToCache`** — if URL starts with
   `file://` or `content://`, return it unchanged (no download).
   Otherwise download as before.
2. **`lib/moodEngineActions.ts applySleepWakePhoto`** — when the
   custom-pair ID is a direct URI, pass it as the image source
   directly; else look up via `getPhotoById`.
3. **`app/(tabs)/mood.tsx`** — new module-scope `resolveCustomImage(id)`
   helper used by both `CustomSlot` (in-picker thumb) and the SW card's
   dual-thumb (post-save preview). The Mood Home "Currently applied"
   resolver now has a fourth branch that treats `file://` / `content://`
   IDs as direct image URIs with title "My gallery photo".

## Files changed

**New:**
- `lib/galleryPicker.ts` — expo-image-picker wrapper
- `changes/042-sleep-wake-gallery-picker-and-tap-fix.md`

**Modified:**
- `package.json` — adds `expo-image-picker@^55.0.20`
- `app.json` — adds expo-image-picker plugin with photo permission string
- `app/(tabs)/mood.tsx`:
  - imports SimpleButton + pickGalleryImage
  - new `customCellWidth` memo from `useWindowDimensions`
  - photo grid uses SimpleButton with explicit width/height (touches work)
  - new "Pick from your phone gallery" button + "or pick from below" divider
  - new `onPickFromGallery` handler with permission flow + slot assignment
  - new `resolveCustomImage` module-scope helper (handles URI-as-ID)
  - `currentPhoto` resolver gains URI branch
  - SW card dual-thumb uses `resolveCustomImage` (was `getPhotoById`)
  - `CustomSlot` uses `resolveCustomImage`
  - new `swStyles.galleryBtn`, `swStyles.galleryBtnText`, `swStyles.divider`
  - dropped percentage width from `swStyles.photoCell`
- `lib/wallpaperActions.ts downloadToCache` — skip download for local URIs
- `lib/moodEngineActions.ts applySleepWakePhoto` — URI branch in custom path

## Verification

1. **Native rebuild required** — `expo-image-picker` ships native code:
   `npx expo run:android --variant release`. ~5–10 min.
2. **Tap fix on curated grid:**
   - Mood tab → Sleep/Wake → tap pack row → tap "Custom pair"
   - Scroll the photo grid → tap any photo → wake slot fills with gold ☀️ badge
   - Tap another → sleep slot fills with lavender 🌙 badge
   - Tap a selected → clears that slot
   - Save activates → tap → toast "✓ Custom pair saved"
3. **Gallery flow:**
   - In custom picker, tap **"Pick from your phone gallery"** (cyan pill at top)
   - First time: grants gallery permission via system prompt
   - System gallery opens → pick any photo from your phone
   - If both slots empty OR both filled → premium alert "Use as ☀️ Wake / 🌙 Sleep / Cancel"
   - If only one slot empty → auto-fills that slot, toast confirms
   - Slot shows your photo (resolved as direct URI — no download needed)
   - Mix gallery + curated photos freely (one slot from gallery, other from grid)
   - Save → main SW card now shows your photos in the dual-thumb
4. **Apply path:**
   - At wake/sleep time → notification fires with your photo's pack name
   - Tap to apply → setAsWallpaper takes the file:// URI directly (no download)
   - Wallpaper changes
5. **Permission denied:**
   - In Settings, revoke photo library permission
   - Tap "Pick from your phone gallery" → premium alert "Gallery access needed"
   - Tap "Open Settings" → system settings opens to our app

## Notes

- **Tap-not-registering pattern is now well-understood and documented**
  in code. Future grid implementations inside bottom-sheets should
  default to `SimpleButton`, not `AnimatedButton`.
- **`MediaType` vs `MediaTypeOptions`**: expo-image-picker renamed this
  between SDKs. Our wrapper accepts whichever one the linked version
  exports so the same source works across SDK 50 → 53+ without code
  changes.
- **Gallery URIs are stable for the OS session** — they remain valid
  while the file isn't deleted from the user's gallery. If the user
  deletes the photo later, the next `setAsWallpaper` will fail. We
  surface this via the existing `setAsWallpaper` error path (toast).
  Long-term fix would be to COPY the picked photo to our cache dir at
  pick time; current behaviour is acceptable for the feature scope.
- **Curated mock pool is still there** as a fallback for users who
  don't want to dig through their gallery. The two sources mix freely.
- **Permission only asked when the user taps the gallery button**, not
  on toggle-on. Less friction for users who only ever use the curated
  pool.
- **No iOS-only / Android-only branches** — same code path; the OS
  picker UI is whatever the platform provides.
