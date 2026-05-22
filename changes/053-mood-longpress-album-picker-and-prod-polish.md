# Mood long-press album picker + production polish

**Date:** 2026-05-18
**Type:** feature + chore

## Problem

After 052 landed and the release APK proved the FGS path works end-to-end,
the user came back with two follow-ups:

1. **"In the mood-based screen when I long-press the album image, open
   all album list to select what we want to set."** Today the only way
   to switch albums is to tap the Pool row, which navigates to a
   full-screen `/mood/pick-collection` route. Coming back is a 2-tap
   round-trip. The user wants an in-place quick switcher.
2. **"Make the mood-based as production ready — test mode is done and
   is perfectly working now."** Two visible "(test)" buttons remain on
   the Mood Home screen ("Scan now (test camera)" and "Run background
   now (test)") from the dev-flow days. They shouldn't ship in a
   release build.

## Solution

### 1. Long-press → in-place album picker

`AnimatedButton` already passes through `PressableProps`, so adding
`onLongPress` + `delayLongPress={250}` to the existing Pool row is free
— no new gesture handler, no nesting issues with the tab scroll
container. Tap behavior is preserved (navigates to the full picker for
users who prefer that affordance); the long-press is the quick path.

New `albumPickerRef: BottomSheetModal` opens a `PremiumSheet` (the same
primitive the Sleep/Wake pack picker uses) snapped to 78% with one row
per available album:

- All user-built mood collections (`!seedPackId && purpose === 'mood'`)
- All built-in theme packs (whether already materialized as a
  Collection or not — surfacing inactive packs lets the user discover
  new pools without navigating away)

Tap-to-pick uses the same `ensureBuiltinPackCollection` flow change 052
fixed in `app/mood/pick-collection.tsx` — materializing a built-in pack
without flipping the shuffle's `activeCollectionId`, so the
mutual-exclusion subscriber in `lib/moodBootstrap.ts` doesn't tear down
the mood feature. Selecting an album calls `setMoodCollection(cid)`,
toasts confirmation, and dismisses. No navigation.

Pool meta copy updated from `"X photos · tap to change"` to
`"X photos · tap to open · hold to switch"` so the gesture is
discoverable.

### 2. Hide debug buttons in release builds

Both test buttons gated behind `__DEV__`:

- `app/(tabs)/mood.tsx:1024` — `"Scan now (test camera)"` (was dormant
  in release anyway since `CAMERA_FEATURE_ENABLED = false`, but the
  conditional still rendered the import chain)
- `app/(tabs)/mood.tsx:1173` — `"Run background now (test)"`

Their copy was also tightened to drop the parenthetical "(test)"
labels and trim the wording in the dev-only branch — clear that
they're verification utilities, not user features.

Production users see the Background-mode card with its toggle, the
honest-disclosure note about OS-decided cadence, and nothing else.
The bg-task runs on the OS schedule; the history-row in the mood
card is how the user confirms it's working.

## Files changed

- `app/(tabs)/mood.tsx`
  - Imports: consolidate `mockData` (add `themePacks`, `getThemePackPhotos`)
    and drop the now-unused separate `getMoodPhotos` line
  - Add `setMoodCollection` + `ensureBuiltinPackCollection` selectors
  - Add `albumPickerRef: BottomSheetModal` and `AlbumRow` data model +
    `albumRows` memo + `onLongPressPool` + `onPickAlbum`
  - Wire `onLongPress` and `delayLongPress` on the Pool row
    `AnimatedButton`; update meta copy
  - Render new `<PremiumSheet ref={albumPickerRef}>` after the
    Sleep/Wake custom-pair sheet
  - Gate the two `(test)` buttons behind `__DEV__` and trim the copy
  - Add `albumSheetStyles` StyleSheet
- `changes/README.md` — index row (added separately)

## Verification

On the device (release APK):

1. Mood tab → confirm there is **no** "Scan now" or "Run now" pill
   anywhere on the screen even when Background mode is on.
2. Tap the Pool row → still navigates to the full
   `/mood/pick-collection` screen. (Existing affordance, unchanged.)
3. Long-press the Pool row → bottom sheet slides up listing every
   mood collection + every theme pack. Tap any row → toast appears,
   sheet dismisses, Pool name + thumb updates in place. No navigation.
4. Repeat step 3 with a different album → the switch works on the
   second, third, Nth attempt (the bug 052 fixed). Background mode
   toggle stays in whatever position it was in.
5. Run a dev build (`npx expo start`) → the two `__DEV__`-gated
   buttons reappear so testers can still trigger immediate scans /
   bg-runs without waiting for the OS cadence.

## Notes

- The `albumPickerRef` sheet shares the SAME `ensureBuiltinPackCollection`
  pathway as the full picker — both surfaces are now safe against the
  mutual-exclusion regression that change 052 fixed.
- 78% snap point chosen so the picker can show ~5-6 rows above the
  fold without forcing scroll on a typical phone. Long lists scroll
  inside the sheet body (`PremiumSheet` uses `BottomSheetScrollView`
  under the hood — automatic).
- The `__DEV__` constant is set by Metro/Babel at build time, so the
  release JS bundle inlines `__DEV__ && X` to a literal `false && X`
  which the minifier dead-code-eliminates. No runtime cost, no
  bundle bloat from the dev branches.
- This change is JS-only. No native rebuild required.
