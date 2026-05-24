# Split 6 small screens under 300 (pure extraction)

**Date:** 2026-05-24
**Type:** refactor

## Problem

Six smaller screens over the 300 soft cap: `ai/preview.tsx` (485), `(tabs)/couple.tsx`
(369), `mood/history.tsx` (349), `wallpaper/[id].tsx` (346), `(auth)/profile-setup.tsx`
(333), `theme-pack/[id].tsx` (302). Batch B continued, parallel agents, verified centrally.

## Solution

PURE presentational extraction only (styles + props-only sub-components + pure helpers).
No hook moved, no custom hook, no dependency-array change. Routes/default-exports kept.
All extracted files outside `app/`.

- **ai/preview.tsx 485→297** — styles + `PreviewActions`/`PreviewHeader`/`EmptyState` → `components/aiPreview/`.
- **(tabs)/couple.tsx 369→187** — styles + `CoupleCard` → `components/coupleTab/`.
- **mood/history.tsx 349→169** — styles + `SourcePill`/`HistoryRow` → `components/moodHistoryScreen/`; pure `formatTime` → `lib/formatMoodTime.ts`.
- **wallpaper/[id].tsx 346→273** — styles → `components/wallpaperPreview/styles.ts`.
- **(auth)/profile-setup.tsx 333→219** — styles → `components/profileSetup/styles.ts`.
- **theme-pack/[id].tsx 302→241** — styles → `components/themePackDetail/styles.ts`.

## Verification

`npx tsc --noEmit` → 5 total errors, all pre-existing (the `ai/preview` Href-cast error
just shifted line 222→227 as the file shrank). **0 new.** Behaviour-preserving; JS only.

## Notes

- Campaign progress: 28 / ~35 addressed.
- Remaining screens: `mood.tsx` (3047), `shuffle/[id]` (1047), `ai.tsx` (637),
  `couple/preview` (305), `(auth)/login` (304); plus `moodNotifications`/`moodBootstrap`
  lib exceptions.
