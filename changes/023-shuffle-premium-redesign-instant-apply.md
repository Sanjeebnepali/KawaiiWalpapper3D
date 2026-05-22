# Shuffle premium redesign + instant-apply + drop mood mode

**Date:** 2026-05-16
**Type:** fix (UX) + feature

## Problem

User feedback on the relocated shuffle hub (`changes/022`):

1. The Theme Packs hub "feels depressing" — the 2×2 thumbnail mosaic
   cards look like a generic photo grid, not a premium wallpaper app.
2. The photo picker in the collection-detail screen used 3-col square
   cells. Squares don't read as wallpapers; portrait crops do.
3. "Mood" shuffle mode never had a real signal in this app — the
   feature was a placeholder that fell through to sequential. Remove
   it.
4. **"How do I actually set the wallpaper?"** — after tapping
   "Shuffle Pink Lolita", nothing visible happened until the first
   timer tick (60+ minutes on default interval). The user assumed
   the feature was broken.

## Solution

### 1. Theme Packs hub — premium hero cards

Rewrote each pack card from `2×2 thumbnail mosaic` to a single
**hero portrait card** matching the visual language already used by
`GlassCard` and `CollectionGrid`:

- 3:4 portrait aspect, rounded corners, hero image fills the card.
- LinearGradient darkening (`0.05 → 0.45 → 0.92`) for legible text.
- A thin accent strip at the top (`accent → transparent`) tinted per
  pack (rotating through `pink / lavender / cyan / gold`).
- Top row: `count` pill (image icon + count, accent-tinted) on the
  left and `LIVE` pill (with a dark indicator dot) on the right
  when this pack is the active shuffle.
- Bottom row: big title, sub-line ("12 wallpapers"), action cluster
  with a primary **Shuffle** pill (accent fill) + secondary
  **albums** icon button to open the pack detail.

The hero image is `getThemePackPhotos(packId, 1)[0]` — the exact
URL the shuffle engine applies for index 0, so the card preview
**matches** what the user gets after tapping Shuffle (no visual
lie).

User collections section also got a parallel premium treatment:

- 86 px tall rows with a real hero image on the left (left-side
  gradient fade so the title is legible).
- Meta is now three small chips (count, mode, timer) instead of a
  single comma-separated line — much more scannable.
- "LIVE" pill with indicator dot matches the pack cards.
- Empty state replaced from a single line of dim text to a
  glow-bordered icon + headline + subtext card.

Active banner at the top uses the active collection's first
photo as a blurred backdrop with gradient darkening on top — feels
like the active surface in Spotify / Apple Music.

### 2. Photo picker — portrait aspect + premium selection UI

`app/shuffle/[id].tsx` picker section:

- Cells changed from `1:1` square to `9:16` portrait — they now
  look like phone wallpapers, not gallery thumbnails.
- Selection state:
  - Number badge moved from top-left to top-right with shadow.
  - Translucent accent fill (`rgba(250,179,202,0.18)`) overlays the
    selected cell.
  - Unselected cells dim to `opacity: 0.55` once the user starts
    picking, so the selection set "pops".
  - Unselected cells now show a small `+` badge in the top-right so
    the affordance is visible at a glance.
- Card head replaced "Photos · 3/10" two-text layout with a
  `count chip` (border + icon + count, fills accent once at 10/10)
  and a `Clear` underline-link to wipe the selection.
- 8px gap (was 6) and 12px corner radius (was 8) — more breathing
  room.

### 3. Removed `mood` mode

`constants/shuffle.ts`: dropped from `ShuffleMode` union + the
`SHUFFLE_MODES` catalog. The picker no longer shows it.
`hooks/useShuffleEngine.ts` `pickNextIndex` had a `case 'mood'`
that fell through to sequential; replaced with a defensive default
fallback so any persisted state from older builds that still
carries `mode: 'mood'` continues to work as sequential.

### 4. Instant apply on Shuffle / Start

The key UX gap: timer-based shuffling means **nothing happens for
60+ minutes after the user taps Shuffle**. Fixed by extracting a
shared helper and calling it on activation:

- **`lib/shuffleActions.ts`** — new module exports
  `applyCollectionPhoto(collectionId, photoIds, index)` which
  resolves the photo via `getPhotoById`, calls
  `lib/wallpaperActions.setAsWallpaper(url, id, 'both')`, and
  records the result into shuffle history. Single place to own
  the "apply + record" sequence.
- **`app/wallpapers/theme-packs.tsx`** — `onShufflePack` calls
  `activateBuiltinPack` (creates / re-activates the collection)
  then `applyCollectionPhoto(..., 0)` for instant change. User
  taps Shuffle → wallpaper changes in 1–2 seconds → navigated to
  Active screen which now shows the just-applied photo with the
  next-tick countdown.
- **`app/shuffle/[id].tsx`** — `toggleActive` likewise calls
  `applyCollectionPhoto(..., 0)` after `setActive`. Starting a
  custom collection feels identical to a built-in pack.

On Android this lands as a real wallpaper change via the
`wallpaper-setter` Expo module (or the MediaStore fallback if the
module isn't in the dev build yet). On iOS it saves to Photos with
a toast hint — same path the existing `setAsWallpaper` already
took.

## Files changed

**New:**

- `lib/shuffleActions.ts` — `applyCollectionPhoto` helper.

**Modified:**

- `constants/shuffle.ts` — remove `mood` from `ShuffleMode` and
  `SHUFFLE_MODES`.
- `hooks/useShuffleEngine.ts` — drop `mood` case; defensive
  fallback in `pickNextIndex`.
- `app/wallpapers/theme-packs.tsx` — premium PackCard hero
  layout, premium UserCollectionRow, premium ActiveBanner with
  blurred backdrop, premium SectionHeader; instant-apply on
  `onShufflePack` via new helper.
- `app/shuffle/[id].tsx` — picker portrait 9:16 aspect, count
  chip + Clear, translucent selected fill, dim unselected, `+`
  badge on unselected, instant-apply in `toggleActive`.

## Verification

Pure JS — no native rebuild.

```
npx expo start --clear
```

Then on device:

1. **Home → Theme Packs** — should look like a premium wallpaper
   app: 6 portrait hero cards, accent strips, glass-style titles.
2. **Tap "Shuffle" on Pink Lolita** — should apply the wallpaper
   **immediately** (1–2 s on Android), then navigate to Active
   screen with countdown ticking and Pink Lolita's first photo as
   the preview.
3. **Back to Theme Packs** — Pink Lolita card shows "Shuffling"
   with sync icon and a `LIVE` pill on top.
4. **+ Create custom collection** → detail screen — picker shows
   portrait cells, `+` badges on unselected, tap to select →
   numbered checkmark badge, translucent accent overlay, unselected
   cells dim. Count chip on top reads `1/10`, then `2/10` etc., goes
   solid pink at `10/10`.
5. **Start shuffle** on the custom collection — wallpaper applies
   immediately, navigates to Active.
6. **Shuffle Mode** section in detail — "Mood" is gone. Only
   Sequential / Random / Day-based / Smart time (last is premium).

## Notes

- **Why `9:16` and not the source aspect?** Picsum source images
  are stored at `720×1280` (9:16), so a 9:16 crop preserves them
  exactly with no center-crop discarding pixels. Squares cropped
  20% off the top + bottom of each.
- **Why a per-pack accent rotation instead of `theme.primary`?**
  Six identical pink cards on one screen looks generic. Rotating
  pink → lavender → cyan → gold gives the grid visual rhythm
  while staying inside the existing design palette.
- **Why is the active card's Shuffle button `"Shuffling"` instead
  of `"Stop"`?** Tapping it re-shuffles (re-seeds photos +
  re-applies first). To stop, the user uses the Pause button on
  the Active screen or deactivates from the detail. Putting a
  Stop on the home grid would clutter; users almost never want
  to stop, they want to switch.
- **iOS instant-apply**: on iOS, "apply" means "save the image to
  Photos + open Photos to Use as Wallpaper." Same UX the rest of
  the app uses (`changes/014`); the Active screen's iOS callout
  still tells the user to finish the manual step.
- **Mood mode persistence**: existing collections with `mode: 'mood'`
  saved in `cacheDirectory/shuffle-state.json` will still load. The
  engine's fallback treats them as sequential; the picker won't
  show "Mood" so the user can switch to a real mode the next time
  they open the detail.
