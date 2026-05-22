# Mood pool: in-place Create + three photo sources (app / gallery / internet)

**Date:** 2026-05-18
**Type:** feature

## Problem

Two UX gaps the user flagged while debugging the mood-based feature:

1. **Mood pool picker had no "Create" entry point.** `app/mood/pick-collection.tsx`
   only listed existing user collections and built-in theme packs. The empty
   state literally redirected the user away: *"No collections yet. Build one
   from the Theme Packs hub."* So to build a custom 10-photo pool the user
   had to back out of Mood, navigate to `wallpapers/theme-packs`, hit
   Create, edit it, then come back to Mood and pick it.
2. **Collection editor sourced photos from the bundled catalog only.**
   `app/shuffle/[id].tsx` built `pickerSource` from `searchCatalog`
   (`constants/mockData.ts`). No "Browse from gallery" button. No "Add from
   internet" button. The user explicitly asked for three sources: in-app
   catalog (already there), device gallery, and arbitrary internet URL
   downloaded into the app's own cache (NOT saved to the device gallery).

## Solution

### 1. URI-style photo IDs are first-class

`constants/mockData.ts:getPhotoById` now recognises `file://`, `content://`,
`http://`, and `https://` ids and returns `{ id, image: id, title: 'My photo' }`
directly. That single change lets a gallery URI or a cache-downloaded
internet image flow through the entire engine + picker pipeline without
ever touching a special-case branch:

- `applyCollectionPhoto` → `getPhotoById` (URI) → `setAsWallpaper(uri, …)`
  → `downloadToCache` (skips download for `file://` / `content://`).
- Mood pool picker thumbnail (`photoThumb`) renders the URI directly.
- Shuffle editor's `pickerSource` "extras" branch surfaces selected URI
  photos as removable cells so the user can deselect them.
- `lib/moodBucket.getMoodBucket` already hashes any string deterministically,
  so a URI photo lands in a stable mood bucket and works with
  `pickPhotoForMood` exactly like a catalog photo.

### 2. "Create your own pool" in the mood picker

`app/mood/pick-collection.tsx` gains a dashed-border `ListHeaderComponent`
row above the existing list. Tap:

1. `gatePremium`-safe path through `canAddCollection` (free tier still
   capped at 1 user collection; built-in packs are exempt).
2. `useShuffleStore.createCollection('My pool')` mints a fresh empty
   `Collection`.
3. `useMoodStore.setMoodCollection(newId)` wires it as the mood pool
   immediately — so if the user backs out of the editor, Mood Home still
   reflects the new (empty) collection, easier to discover than the old
   "navigate back through the picker" loop.
4. `router.push({ pathname: '/shuffle/[id]', params: { id, fromMood: '1' } })`
   hands off to the editor.

### 3. Three sources in the editor

`app/shuffle/[id].tsx` adds a two-button row above the in-app catalog
grid:

- **📸 Gallery** → `pickGalleryImage()` (reused from Sleep/Wake's custom
  pair). Returns a `file://` URI from `expo-image-picker`. Pushed straight
  onto `photoIds`. Permission denial pops a premium-alert with Open
  Settings.
- **🌐 Internet** → opens a new `PremiumSheet` with a URL `TextInput` and
  a "Download & add" button. New `downloadInternetImage(url)` helper in
  `lib/wallpaperActions.ts` validates the URL is http(s), hashes it for a
  stable cache filename (`kawaii-user-<djb2>.jpg`), downloads via
  `FileSystem.downloadAsync` into `cacheDirectory`, and returns the local
  `file://` URI. The URI is pushed onto `photoIds`. The image **only**
  lives in the app cache — no `MediaLibrary.saveAsync` call, so the
  device gallery stays untouched. The sheet's footnote tells the user
  this explicitly.

A shared `addUriPhoto(uri)` helper guards against duplicates and the
10-photo cap so both source paths share the same validation surface.

### 4. `fromMood=1` round-trip

When `app/shuffle/[id].tsx` is entered with `fromMood=1`, the "Start
shuffle" button calls `router.back()` instead of `router.push('/shuffle/
active')`. The user lands back on Mood Home with the freshly-built
collection wired as the mood pool and a wallpaper applied. (Non-mood
entry — i.e., from Theme Packs hub — keeps the original `/shuffle/active`
behaviour.)

## Files changed

**Modified:**
- `constants/mockData.ts` — `getPhotoById` short-circuits for URI ids.
- `lib/wallpaperActions.ts` — exports new `downloadInternetImage(url)`
  that wraps the existing `downloadToCache`, validates http(s), and
  hashes URLs for stable cache filenames.
- `app/mood/pick-collection.tsx` — `ListHeaderComponent` Create row +
  `onCreate` handler that creates, wires as mood pool, navigates to
  editor with `fromMood=1`.
- `app/shuffle/[id].tsx` — Gallery + Internet source buttons above the
  picker grid; URL-paste `PremiumSheet` with `TextInput`; `addUriPhoto`,
  `onPickFromGallery`, `openUrlSheet`, `onSaveUrl` handlers; `fromMood`
  param branch in `toggleActive` so the Start button pops back to Mood
  Home instead of pushing the stand-alone shuffle screen.

## Verification

1. `npx expo start --clear` (JS-only — no new native deps; reuses already-
   linked `expo-image-picker` and `expo-file-system/legacy`).
2. Open Mood tab → tap "Set mood pool" → the picker opens with a new
   dashed cyan "Create your own pool" row at the top.
3. Tap it → free tier sees the limit-reached alert if one custom
   collection already exists; otherwise lands in the collection editor
   with an empty 10-slot picker.
4. Inside the editor:
   - Tap **Gallery** → device gallery opens → pick an image → returns to
     editor with the new cell present and selected (1/10 chip ticks up).
   - Tap **Internet** → bottom-sheet → paste a real image URL (e.g.
     `https://picsum.photos/seed/abc/640/1138`) → tap "Download & add"
     → sheet dismisses → new cell appears in the grid (2/10).
   - Invalid URL → toast "Enter a valid http(s) URL"; failed download →
     toast "Download failed — check the URL"; toggle is not consumed.
5. Fill the remaining slots from the in-app library, set name + timer
   + mode, tap **Start shuffle** → wallpaper applies (first picked
   photo) → app routes back to Mood Home (not `/shuffle/active`)
   because `fromMood=1` was set.
6. Mood Home's "Currently applied" card resolves the gallery / internet
   photo correctly (title shows "My photo", thumbnail renders).
7. Confirm the downloaded internet image is **not** in the device
   gallery (open Photos / Gallery app — nothing new). The file lives at
   `<cacheDirectory>/kawaii-user-<hash>.jpg` only.

## Notes

- **No URL search/browse UI in this pass.** "From internet" is a paste
  flow because (a) it ships in one screen with zero legal/scraping
  surface, (b) it covers Pinterest-via-paste, Google-images-via-paste,
  and any direct-link image, and (c) it doesn't need a WebView native
  dep. A future pass can add a curated remote feed if needed — the
  download plumbing already supports any http(s) URL.
- **Cache eviction.** Files in `FileSystem.cacheDirectory` can be reaped
  by the OS under storage pressure. If a downloaded URI gets evicted,
  `setAsWallpaper` will fail at apply time with a file-not-found error
  (toast surfaces it). For Phase 2 we may move user-imported images to
  `documentDirectory` for stronger persistence — not done here because
  it would require user-facing "manage storage" UX too.
- **Free-tier cap intact.** `canAddCollection(isPremium)` already excludes
  `seedPackId`-flagged built-in packs from the count, so the user can
  still activate any of the curated packs as a mood pool without burning
  their one custom slot. Building a custom pool is what counts.
- **Sleep/Wake's custom-pair picker is unchanged.** It uses its own
  separate URI flow inside `app/(tabs)/mood.tsx`. The new mood-pool
  creator is independent and doesn't touch the SW data path.
