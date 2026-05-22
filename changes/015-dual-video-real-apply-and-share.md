# Real Set-as-Wallpaper on Dual screen + Share on Dual/Video

**Date:** 2026-05-15
**Type:** feature

## Problem

Audit of the spec in `AGENT_PROMPT.md` against the current codebase:

- `app/wallpapers/dual.tsx` `setWallpaper` was a **fake** — it did
  `await new Promise(r => setTimeout(r, 1200))` and then showed a
  success toast (lines 42–75 of the pre-change file). No image ever
  reached the system wallpaper.
- Dual and Video screen back-arrow `Ionicons` were hardcoded to
  `Colors.text` — the rest of those screens (container bg, title)
  already used `theme.bg` / `theme.text` from `useTheme()`, so the
  back arrow visibly clashed when the user picked a non-default
  theme.
- Neither Dual nor Video screens exposed a way to share a wallpaper.
  The single-wallpaper preview (`app/wallpaper/[id].tsx`) has had
  share since #012 via the ⋯ menu, but the list screens did not.

The rest of `AGENT_PROMPT.md` (Issues 3, 4, 5, parts of 8) described
components that already existed and were already wired correctly
(`VideoWallpaperCard`, `WallpaperGridCell`, the Apply button in
`wallpaper/[id].tsx`). The spec also asked us to introduce a custom
`useWallpaperManager` hook backed by `Share.share({url})` and an
optional `react-native-wallpaper-manager` native module — that would
have *regressed* the real Android `ACTION_ATTACH_DATA` flow we shipped
in #014. Per user direction, this change implements **real gaps only**.

## Solution

### `app/wallpapers/dual.tsx`

- Drop the `setTimeout` placeholder and the `Platform` / `ToastAndroid`
  imports it relied on.
- Import `setAsWallpaper` and `shareWallpaper` from
  `lib/wallpaperActions` and `toast` from `lib/toast` — same helpers
  already used by `SetAsWallpaperModal` and `WallpaperMenu`. This keeps
  *all* set/share flows in one place (the Android
  `ACTION_ATTACH_DATA` + iOS Photos deep-link logic from #014 is
  reused for free).
- `setWallpaper(uri, target, item)` now calls
  `setAsWallpaper(uri, item.id, target)` and toasts the helper's
  message. `applyingId` is still set so the per-card "Applying…"
  overlay shows while the image downloads — the OS picker takes over
  once it appears, and the overlay clears on return.
- Drop the local `WallpaperTarget` type and import it from
  `lib/wallpaperActions` so the union doesn't drift.
- Add a 4th "Share" entry to the existing Lock / Home / Both / Cancel
  `Alert`. Tapping it calls `shareWallpaper(item.lockImage, item.id)`
  (the lock image is what the card displays). The system share sheet
  provides its own UX; we only toast on failure.
- Change the back-arrow `<Ionicons color={Colors.text} />` to
  `theme.text` so it re-colors with the active theme.

### `components/VideoWallpaperCard.tsx`

- Add an optional `onLongPress?: (id: string) => void` prop. When
  supplied, the `<Pressable>` wires `onLongPress` with `delayLongPress`
  set to 300 ms (matches `WallpaperGridCell` from #010). The card
  remains memoized; `onLongPress` is undefined-safe so existing call
  sites are unaffected.

### `app/wallpapers/video.tsx`

- Import `shareWallpaper` and `toast`. Add `handleShareVideo(id)` —
  resolves the video by id and calls `shareWallpaper(v.thumb, v.id)`.
  Sharing the still thumbnail rather than the `.mp4` is deliberate:
  downloading the full video first would be slow and the still is what
  the user actually sees on the card.
- Pass `onLongPress={handleShareVideo}` to `<VideoWallpaperCard>`.
- Change the back-arrow `<Ionicons color={Colors.text} />` to
  `theme.text` for the same reason as Dual.

## Files changed

- `app/wallpapers/dual.tsx` — wire real setAsWallpaper, add Share to
  the Alert, themeify back arrow, drop dead Platform/ToastAndroid
  imports and the local `WallpaperTarget` type.
- `app/wallpapers/video.tsx` — wire long-press share via thumbnail,
  themeify back arrow, import `shareWallpaper` + `toast`.
- `components/VideoWallpaperCard.tsx` — add optional `onLongPress`
  prop with 300 ms delay; backwards-compatible.

## Verification

Dual:
1. Open the Dual Wallpapers screen, tap a card.
2. In the Alert, tap Lock Screen → the **real** Android
   `ACTION_ATTACH_DATA` picker opens on the image (or, on iOS, Photos
   opens via the `photos-redirect://` deep-link, per #014). Toast
   reads `✓ Pick "lock screen" in the picker`.
3. Repeat for Home Screen and Both — same flow with appropriate
   target labels.
4. Tap a card → Share → the system share sheet opens with the lock
   image attached.
5. Change theme in Settings → return to Dual — back arrow + title +
   container all re-color together.

Video:
1. Open Video Wallpapers, tap a card → VideoPlayer opens (unchanged).
2. **Long-press** any card → system share sheet opens with the
   thumbnail attached.
3. Change theme → back arrow re-colors with `theme.text`.

## Notes

- `AGENT_PROMPT.md` Issues 3 / 4 / 5 / iOS share / preview share were
  already done in earlier changes (#007, #010, #012, #013, #014). They
  were re-verified during this audit and intentionally left untouched.
- The spec's proposed `hooks/useWallpaperManager.ts` was rejected: it
  would have used `Share.share({url})` which on Android shares the URL
  *string*, not the file, so "Set as wallpaper" never appears in the
  share sheet. The proper `setAsWallpaper` from
  `lib/wallpaperActions.ts` does what the spec wanted (Android
  `ACTION_ATTACH_DATA` opens the native "Set as wallpaper" picker on
  the user's image) — we just call it directly.
- The spec's `ImageEditorModal` was also rejected because its
  "brightness" control is a CSS opacity hack, not actual image
  processing. The existing `WallpaperMenu` row labelled "Edit Image
  is coming in a future update" stays — a real editor needs either a
  GL shader (for color filters) or a serious `expo-image-manipulator`
  build-out (crop / rotate / flip only). Out of scope here.
- No new dependencies. No native rebuild required — all imports
  already existed in the project.
