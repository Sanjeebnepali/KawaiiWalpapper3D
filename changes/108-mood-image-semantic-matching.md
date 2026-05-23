# Mood → image is now SEMANTIC, not a filename hash

**Date:** 2026-05-23
**Type:** fix

## Problem
A white-box QA pass found the headline defect: tapping a mood (Happy / Sad / Angry …) applied a wallpaper that did **not** match the mood. `getMoodBucket(photoId)` assigned each photo a mood via `djb2(photoId) % 7` — a hash of the photo's **ID string**, with zero relationship to what the image depicts. Worked example: of the 20 photos in the "Happy" folder, only **3** hashed to `happy` (an ~85% mismatch); `mood-happy-1` → `sad`, `mood-happy-2` → `angry`, etc. Worse, in the default albums 2–3 of the 7 moods always had **zero** matching photos, so tapping those moods hit a fallback that applied a **fully random** image. The per-mood preview grid (`/mood/happy`) used the *correct* mapping, so the preview and the applied wallpaper disagreed.

## Solution
Rewrote the bucketing to derive the mood from the photo id's **catalog key**, reusing the mapping that already existed and that the preview grid already trusts (`MOOD_TO_CATALOG` / `MOOD_ALIAS` in `constants/moods.ts`).

- Added `CATALOG_TO_MOOD` (inverse of `MOOD_TO_CATALOG`, built by iterating `MOODS` so the two can't drift) plus the extra catalog folders that have no first-class picker mood (`love`→`happy`, `heartbroken`→`sad`, `nervous`→`neutral`, `confused`→`surprised`).
- `getMoodBucket(photoId)` now first parses `mood-<catalogKey>-<n>` and returns the real `MoodId`. Only ids with **no** semantic mood (arbitrary theme-pack photos like `pink-lolita-0`, `file://`/`content://` gallery URIs, http URLs) fall back to the original djb2 hash so distribution stays deterministic.
- `pickPhotoForMood` fallback order is now (1) the mood's own bucket; (2) **M6** — if that bucket was non-empty but emptied only because its single match is the currently-applied photo, re-apply that one *correct* photo rather than going random; (3) **C2** — borrow from a semantic nearest-neighbour mood (`MOOD_NEIGHBORS`, e.g. happy↔excited, sad↔angry↔neutral) that is present; (4) pure random only as a last resort.
- All four exported signatures (`getMoodBucket`, `photosForMood`, `pickPhotoForMood`, `tallyMoodBuckets`) are unchanged, so `lib/moodEngineActions.ts` and the screens that call them compile untouched. `tallyMoodBuckets` (the mood-balance bar) now reports *true* semantic counts.

## Files changed
- `constants/moods.ts` — added `CATALOG_TO_MOOD` export (additive only; no existing export changed).
- `lib/moodBucket.ts` — `getMoodBucket` derives semantic mood then falls back to djb2; new `moodCatalogKey` parser, `MOOD_NEIGHBORS` adjacency map; `pickPhotoForMood` rewritten for the C2/M6 fallback order; doc-comments updated so they no longer claim pure hashing.

## Verification
- `npx tsc --noEmit` — no new errors in the changed files (5 pre-existing unrelated errors remain in `app/(tabs)/ai.tsx`, `app/ai/preview.tsx`, `modules/*-foreground`).
- Traced by hand: `mood-happy-1` → `happy` ✓, `mood-crying-3` (sad→crying alias) → `sad` ✓, `mood-angry-7` → `angry` ✓. `tallyMoodBuckets` over a mood album now spreads across the emotions actually present.
- On device: open Mood Based, set a mood album as the pool, tap Happy/Sad/Angry — the applied wallpaper now matches the tapped emotion (was random before).

## Notes
- **Theme-pack-only pools still can't semantically match** — ids like `pink-lolita-0` carry no emotion, so they fall through to the hash + neighbour/random path. There's no fix without per-image emotion tagging; the neighbour step at least stops such pools from freezing. Honest limitation, flagged for the owner.
- `confused`/`nervous`/`love`/`heartbroken` map to the nearest of the 7 picker moods — consistent with the design's existing `MOOD_ALIAS` philosophy.
- Background rotation root cause noted separately: `lib/contextMood.ts` only emits a subset of moods (see change 109).
