# Split faceDetection / shuffleActions / wallpaperActions under the cap

**Date:** 2026-05-24
**Type:** refactor

## Problem

Three `lib/` helper files were over the 300 soft cap: `faceDetection.ts` (301),
`shuffleActions.ts` (313), `wallpaperActions.ts` (392). Files 7–9 of the file-size
campaign. Each is cohesive, so each got ONE clean concern-boundary extraction (no
circular imports), bodies verbatim.

## Solution

- **faceDetection.ts → 226.** Frame inspection (`analyzeFrame` + `FrameStats` + `clamp`/`clamp01`) → `faceDetection.frame.ts` (76). The detector API + mood mapping stay.
- **shuffleActions.ts → 218.** Foreground-service control (`precacheCollection`, `startForegroundShuffleForCollection`, `stopForegroundShuffle`) → `shuffleActions.foreground.ts` (112), re-exported. The apply + background-tick logic stays.
- **wallpaperActions.ts → 265.** Cache/download (`downloadToCache`, `downloadInternetImage`, `clearAppCache`) → `wallpaperActions.download.ts` (142), re-exported. The save/share/set-wallpaper actions stay.

All re-exports preserve the public import surface, so no downstream caller changes.

## Files changed

- `lib/faceDetection.ts` (301→226) + `lib/faceDetection.frame.ts` (new, 76).
- `lib/shuffleActions.ts` (313→218) + `lib/shuffleActions.foreground.ts` (new, 112).
- `lib/wallpaperActions.ts` (392→265) + `lib/wallpaperActions.download.ts` (new, 142).

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors in unrelated files, **0 in any of the
six touched files**. Logic relocated verbatim; JS only.

## Notes

- Campaign progress: 9 / ~35 files over 300 done.
- Per the owner's guidance, files where a split would break logic or create circular
  imports (`moodNotifications.ts`, `moodBootstrap.ts`) are NOT being force-split; they'll
  be documented as justified exceptions.
