# Mood bg-reliability + wallpaper fit-to-screen + home restore + distinct albums

**Date:** 2026-05-21
**Type:** fix

## Problem

Owner feedback round after 087/088:
1. **Auto-change ("foot step") only runs while the app is open, stops when
   closed.** Wants it to fire at the scheduled time regardless of app state.
2. **Wallpapers come out zoomed / cut off + blurry / low-res.**
3. **Home over-redesigned** (088). Wants the *previous* layout back, just
   Gym/Yoga → **Painting** in the preview rows, with **taller cards** (per a
   Zedge reference screenshot).
4. **Premium button** should be a section on the **home** (after the album/
   theme rows) where the owner will upload premium photos — not a category icon.
5. **Mood-based albums and Theme-pack albums are identical** — must be
   completely different.

## Solution

**1. Mood auto-change is now Doze-proof (native).** `ContextMoodForegroundService`
still used `Handler.postDelayed` on the main looper — which Doze suspends when
the screen is off (the exact bug shuffle/friend fixed in 081–084; this service
was never migrated). Rewrote it to the proven **AlarmManager
`setExactAndAllowWhileIdle` + BroadcastReceiver** pattern (new
`ContextMoodAlarmReceiver`; manifest declares the receiver + `USE_EXACT_ALARM`/
`SCHEDULE_EXACT_ALARM`). The FGS keeps JS alive so the alarm receiver can invoke
the existing `tickCallback` → `runMoodBackgroundOnce()`. Now the mood tick fires
on time whether the app is open or closed. (Shuffle/Day-based already fire via
their own alarm.)

**2. Wallpapers no longer over-zoom + look sharper.** Both native appliers
(`WallpaperSetterModule` for manual/preview/mood applies, `ShuffleScheduler`
for background rotation) called `setBitmap(..., visibleCropHint = null)`, so
Android scaled the image up to its oversized "desired" wallpaper size and
center-ZOOMED → cut off. Added `fitToScreen()` (cover-scale + center-crop to the
device's exact screen pixels) before `setBitmap`, plus
`suggestDesiredDimensions(screen)`. Less upscaling → sharper, and no extra zoom.
Also re-encoded all wallpapers at **WebP q80 → q90** and versioned the catalog
URLs (`?v=2`) so devices fetch the crisper bytes (42 MB → 70 MB). (Honest
ceiling: source files are ~941px wide — higher-res originals would be needed for
pin-sharp.)

**3. Home restored + Painting + taller cards.** Reverted the 088 Best-Picks-only
home back to the previous layout (category preview rows + Featured carousel + 2D
Kawaii + Moods). `CategoryPreviewList` now shows a curated set —
**painting, football, studying, dance, cooking, photography** (Gym/Yoga
dropped) — as **3 tall portrait cards** per row (was 4 squares).

**4. Premium section on home.** Added a "Premium" section after the album/theme
rows (renders `BestPicksGrid` for now; "See all" → `/category/premium`). Removed
the Premium icon from the category row. Owner will upload dedicated premium
photos → repoint `PREMIUM_SECTION` in mockData then.

**5. Distinct albums.** `mockData` now splits the catalog into two **disjoint**
pools (even vs odd index): `themePacks` (Theme Packs tab) from one,
`moodAlbums` (Mood pool builder) from the other — they can never share an
image. `mood.tsx` + `mood/pick-collection.tsx` iterate `moodAlbums`;
`getThemePackPhotos` resolves either list.

## Files changed
- `modules/context-mood-foreground/.../ContextMoodForegroundService.kt` — Handler → AlarmManager.
- `modules/context-mood-foreground/.../ContextMoodAlarmReceiver.kt` (new).
- `modules/context-mood-foreground/.../AndroidManifest.xml` — receiver + exact-alarm perms.
- `modules/wallpaper-setter/.../WallpaperSetterModule.kt` — `fitToScreen` + suggestDesiredDimensions.
- `modules/shuffle-foreground/.../ShuffleScheduler.kt` — `fitToScreen` in the bg applier.
- `image-pipeline/mapping.js` — q90 + `?v=2`; re-ran optimize/gen-catalog/upload (430 re-uploaded).
- `constants/wallpaperCatalog.ts` (regenerated, versioned URLs).
- `constants/mockData.ts` — disjoint `themePacks`/`moodAlbums`; removed Premium icon.
- `app/(tabs)/index.tsx` — restored layout + Premium section.
- `components/CategoryPreviewList.tsx` — curated keys + 3 tall cards.
- `app/(tabs)/mood.tsx`, `app/mood/pick-collection.tsx` — use `moodAlbums`.

## Verification
- `tsc --noEmit`: 0 errors in changed files (9 pre-existing untouched).
- Public URL re-check after upload: 430/430 uploaded OK.
- NATIVE REBUILD required (Kotlin + manifest changed). After `run`: turn on
  Mood "Auto-change in background" + pick a mood album, lock the phone → it
  changes on schedule while closed; applied wallpapers fill the screen without
  the old zoom/crop and look sharper; home shows the previous layout with
  Painting + tall cards + a Premium section; Theme-pack vs Mood albums differ.

## Notes
- Mood auto-change still needs an active Mood Collection selected; auto-seeding
  a default so it works with zero setup is still task #6, along with surfacing
  love/heartbroken/etc. as picker moods and real premium photos.
- Resolution ceiling is the ~941px source; the q90 + fit-to-screen crop is the
  most that helps without higher-res originals.
