# Mood bottom album strip + Custom (Gallery / URL) button

**Date:** 2026-05-18
**Type:** feature

## Problem

After 053 shipped the long-press album picker, the user came back: "I
don't see anything. Instead of this we need to add at the bottom of the
page so user can select. And there is custom button where user can
search from browser or get from gallery — it's their choice."

Two issues with 053's design:

1. **Long-press is invisible.** No visual affordance hints that the
   gesture exists. The Pool row caption mentioned "hold to switch" but
   that's discovered only by reading the text — users tap, the full
   picker opens, they assume that's the only path.
2. **No quick "add my own photo" affordance.** The full collection
   editor at `/shuffle/[id]` does support gallery + URL imports (change
   048), but it's three screens deep from Mood Home. Users wanted one
   button on Mood Home that asks "Gallery or URL?" and immediately
   uses the chosen photo.

## Solution

### 1. Always-visible bottom "Choose album" strip

A horizontal scrollable strip rendered at the bottom of the Mood Home
ScrollView, after the existing mood-emoji browse row. Cards (120×160)
show every available pool — user's mood collections + every theme pack
(materialized or not). Tap = `setMoodCollection` + toast. Currently
active pool gets a primary-colored border + a checkmark badge in the
top-right corner.

Same data model as 053's sheet (so the mutual-exclusion fix from 052
carries through): built-in packs route through
`ensureBuiltinPackCollection`, not `activateBuiltinPack`, so they
don't accidentally trigger the shuffle-vs-mood-bg subscriber.

### 2. Custom card at the end of the strip

Dashed border, secondary accent color, "+" icon, caption
"Gallery · URL". Tap opens a `premiumAlert`:

- **From Gallery** → `pickGalleryImage` → URI
- **From Internet** → opens a small `PremiumSheet` with a URL
  `TextInput` → `downloadInternetImage` → URI
- **Build full album…** → routes to the existing full picker for
  users who want the catalog browser + 10-slot editor

Either of the first two paths feeds the photo into
`addPhotoToCustomMoodPool(uri)` which:

- Looks up the user's first mood-purpose custom Collection
- If found, slides the new photo into a 10-slot ring (newest at the
  end, evicting the oldest when at cap)
- If none, creates `"My custom mood"` via `createCollection('My custom
  mood', 'mood')` (gated by `canAddCollection` against the free-tier
  one-mood-pool budget; pops the premium alert if over budget)
- Sets the resulting collection as the active mood pool

The user can keep tapping Gallery / URL to grow their album organically,
and the engine starts using new photos as soon as they're added.

### 3. Removed the long-press

Stripped `onLongPress` + `delayLongPress` from the Pool row
AnimatedButton. Caption is back to `"X photos · tap to change"`. The
`albumPickerRef` + bottom-sheet rendering from 053 are gone. The full
picker (existing `/mood/pick-collection` route) still works from the
Pool row tap.

## Files changed

- `app/(tabs)/mood.tsx`
  - Imports: `downloadInternetImage` from `wallpaperActions`,
    `useSettingsStore`, `COLLECTION_SIZE` from `constants/shuffle`
  - Selectors: `createCollection`, `updateCollection`,
    `canAddCollection`, `isPremium`
  - State: `urlInput`; ref: `urlSheetRef`
  - Removed: `albumPickerRef`, `onLongPressPool`, long-press wiring
    on the Pool row, the `<PremiumSheet ref={albumPickerRef}>` render,
    the `albumSheetStyles` StyleSheet
  - Added: `addPhotoToCustomMoodPool`, `onPickFromGalleryForCustom`,
    `onOpenUrlSheet`, `onSaveUrlPhoto`, `onPickCustom` handlers
  - Added: bottom "Choose album" section (sectionHead + horizontal
    ScrollView) rendering one card per `albumRow` plus a final
    "Custom" card
  - Added: `<PremiumSheet ref={urlSheetRef}>` with a URL `TextInput`
    + "Download & use" button
  - Added: `pickerStripStyles` StyleSheet
- `changes/README.md` — index row (added separately)

## Verification

JS-only — reload the bundle / re-install the release APK and:

1. **Mood tab** → scroll to the bottom. A new **Choose album** heading
   appears, followed by a horizontal strip of every theme pack + your
   mood collections. The active one has a primary-colored border and a
   checkmark in the corner.
2. **Tap any card** → toast appears, border on the new card lights up,
   the Pool row at the top updates with the new album name + thumb.
   No screen navigation.
3. **Tap the dashed Custom card** → premium alert appears with four
   options. Pick **From Gallery** → device gallery opens → pick any
   image → toast `"✓ Added from gallery"`, Pool row updates to
   `"My custom mood · N photos"`.
4. **Tap Custom again** → **From Internet** → URL sheet slides up.
   Paste a real image URL → tap Download → toast `"✓ Added from
   internet"`. Pool row count increments. If you paste garbage, you
   get `"Not a valid http(s) URL"` instead.
5. **Repeat 3 or 4 eleven times** → eleventh photo evicts the oldest;
   pool stays at 10. (`COLLECTION_SIZE` cap, sliding window.)
6. **Long-press the Pool row** → nothing happens (gesture removed).

## Notes

- The "My custom mood" collection lives at the Shuffle store level
  (it's a Collection with `purpose: 'mood'`), so it shows up in the
  full `/mood/pick-collection` picker too — the user can switch
  between their custom and built-in packs from either surface.
- Free tier: one custom mood collection. The Custom button keeps
  appending to that one collection no matter how many times the user
  taps it. To delete or rename, they use the existing editor.
- Internet-downloaded images live in `cacheDirectory` via
  `downloadInternetImage` (change 048) — they do NOT touch the device
  gallery, per the user's earlier ask.
- The card aspect ratio (120×160 = 3:4) matches the wallpaper portrait
  ratio so thumbnails preview cleanly without crop surprise.
- This change is JS-only. No native rebuild required.
