# Split 5 more screens (pure presentational extraction)

**Date:** 2026-05-24
**Type:** refactor

## Problem

Five more screens over the 300 soft cap: `couple/dashboard.tsx` (624), `mood/pool/[id].tsx`
(565), `mood/pick-collection.tsx` (561), `mood/camera.tsx` (449), `shuffle/active.tsx`
(421). Batch B continued, parallel agents, verified centrally.

## Solution

PURE presentational extraction ONLY (the locked-in safe rule after the shuffle revert):
`StyleSheet` blocks, props-only sub-components, pure module-level helpers/types. NO hook
moved, NO custom hook, NO dependency-array change. Routes/default-exports kept.

- **couple/dashboard.tsx 624→293** — styles + `CouplePartnerCard`/`CoupleActiveWallpaperCard`/`CouplePackPicker` (props-only) → `components/coupleDashboard/`; pure `formatDistance`/`formatRelative` → `lib/coupleDashboardFormat.ts`.
- **mood/camera.tsx 449→298** — styles → `components/moodCamera/styles.ts` (camera hooks left untouched in the body).
- **shuffle/active.tsx 421→260** — styles + pure `describeStatus`/`formatCountdown` → `components/shuffleActive/`.
- **mood/pool/[id].tsx 565→381** — styles + 4 presentational views → `components/moodPool/`. Still >300 (justified exception): ~240-line residual is hooks + 8 hook-dependent `useCallback` handlers that can't be moved safely.
- **mood/pick-collection.tsx 561→304** — styles + `CollectionRow` + type + pure `photoThumb` → `components/moodPickCollection/`. Still 4 over (justified exception): exported `ErrorBoundary` must stay in the route module + hook-dense body.

## Verification

`npx tsc --noEmit` → same 5 pre-existing errors, **0 new**. (3 transient prop-type
mismatches in the dashboard sub-components — nullable values vs narrower prop types —
were fixed during verification by widening the prop types to match.) Behaviour-preserving.

## Notes

- Campaign progress: 22 / ~35 addressed (3 new fully under cap + 2 documented soft-cap
  exceptions, both under the 500 hard cap).
- Justified exceptions (hook-heavy residual, NOT force-split): `mood/pool/[id].tsx` 381,
  `mood/pick-collection.tsx` 304.
- Remaining: `mood.tsx` (3047), `shuffle/[id].tsx` (1047, redo pure), `ai.tsx` (637),
  `ai/preview.tsx` (485), `(tabs)/couple` (369), `mood/history` (349), `wallpaper/[id]`
  (346), `(auth)/profile-setup` (333), `couple/preview` (305), `(auth)/login` (304),
  `theme-pack/[id]` (302); plus `moodNotifications`/`moodBootstrap` lib exceptions.
