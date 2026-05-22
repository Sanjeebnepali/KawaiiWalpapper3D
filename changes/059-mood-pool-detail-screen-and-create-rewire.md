# Mood pool detail screen + create-flow rewire (theme-pack-style)

**Date:** 2026-05-19
**Type:** feature

## Problem

User report:

> the problem with the create galarry is still there and when i click
> the existing galarry it select but how can i see the images that
> are in the galarry can you solve this two problem and for create
> galarry do completely like what we did in the @app\theme-pack\

Two underlying issues:

1. **No way to view a pool's photos.** Tapping a pool row in the
   picker (`app/mood/pick-collection.tsx`) silently called
   `setMoodCollection` + `router.back()` — the pool became active
   for Mood Mode but the user never saw what was inside it. There
   was no screen anywhere in the app that just *listed the photos
   in a mood pool*. The only photo-grid view was inside the heavy
   `/shuffle/[id]` editor, which is shape-fitted for the Shuffle
   hub's needs (timer picker, mode picker, name editor, source
   tabs) and overwhelms a user who only wants to see what's in
   their pool.
2. **Create-pool flow dropped users in the wrong editor.** Tap
   "Create your own pool" → `createCollection('mood')` →
   `router.push('/shuffle/[id]')`. Same mismatch: a mood-pool
   create lands the user in the Shuffle editor. The user
   explicitly asked for parity with `app/theme-pack/[id].tsx` —
   the clean theme-pack-detail screen with a header, a top CTA,
   and a 2-col photo grid.

## Solution

New screen `app/mood/pool/[id].tsx` modeled directly on
`app/theme-pack/[id].tsx`. Same skeleton — `SafeAreaView` with
back/title header, a single primary CTA row, a 2-col photo grid via
`FlatList` + `useDeferredMount` — adapted for two mood-pool-specific
behaviours that theme-pack doesn't need:

### 1. Mixed photoIds (catalog ref OR direct URI)

Mood-pool `photoIds` arrive from three sources: the app catalog
(catalog IDs like `pack-cosmic-2`), the OS gallery picker (`file://`
URIs), and pasted URLs that were downloaded into cache (also
`file://`). Each row is rendered through a local `resolveImage(ref)`
helper that branches on the prefix — `file://` / `content://` pass
through as the `<Image>` URI; everything else routes via
`getPhotoById`. Same single component renders both kinds without
the caller needing to know which it has.

Tap behaviour mirrors the same branch: catalog IDs route to
`/wallpaper/[id]` (the preview screen, which calls into the
catalog), direct URIs short-circuit to `setAsWallpaper(uri, …, 'both')`
because the catalog has no record of them.

### 2. View vs edit modes via `seedPackId`

`collection.seedPackId` is the discriminator. If set, this pool is
a materialized built-in theme pack — read-only for the mood feature
(packs are curated). If not set, it's a user-built pool — the
screen renders an "Add photos" action bar at the bottom, the
header gets a trash icon for deleting the whole pool, and
long-press on any photo opens a remove-photo confirm.

`isUserPool = !collection?.seedPackId` is the single flag that
flips between the two modes; everything else (CTA, photo grid,
empty state) is shared.

### Top CTA

Mirrors theme-pack's primary CTA shape but with mood semantics:

- Not the active mood pool yet → solid `theme.primary` button,
  "Use this pool for Mood Mode" → calls `setMoodCollection(id)`.
- Already the active mood pool → outlined button, checkmark icon,
  "Active for Mood Mode" — pressing again is a no-op (idempotent).

Refuses to activate an empty user pool with a toast ("Add at least
one photo before using this pool").

### Add-photos flow (user pools only)

A `premiumAlert` with two source options:

- **From Gallery** → `pickGalleryImages({ limit: remaining })`,
  appends to `photoIds` with the same dedupe + sliding-window
  eviction the mood Custom flow uses, then instant-applies the
  first picked URI via `setAsWallpaper(…, 'both')` for immediate
  feedback (matches change 056's UX contract).
- **From Internet** → currently routes the user back to the main
  Mood tab's URL bottom sheet (the in-screen URL paste sheet is
  follow-up work documented below). Tap path also has a
  `onAddFromUrlDirect(url)` helper wired but unreached from this
  screen for now.

When the pool is full (`remaining <= 0`), the button surfaces a
toast pointing the user at long-press to remove a photo first.

### Long-press to remove + delete pool

User pools only. Both actions go through a `premiumAlert` confirm
so the user can't lose state to a stray tap. Delete-pool also
clears the mood pointer (`setMoodCollection(null)`) when the pool
being deleted is currently active, so Mood Mode doesn't keep
pointing at a stale id.

### Rewire `pick-collection.tsx`

Two callback changes:

- `onPick(row)` — no more `setMoodCollection + back`. Materializes
  pack rows via `ensureBuiltinPackCollection` (still the safe path
  per change 052) and routes to `/mood/pool/${cid}`. User now sees
  the photos before deciding to activate.
- `onCreate` — `createCollection` + `setMoodCollection(c.id)` + 
  `router.push('/mood/pool/${c.id}')`. The setMoodCollection-before-
  edit pattern from the old version is preserved so backing out
  of the empty pool without adding photos still leaves the pool
  selected — easier to recover than navigating back through the
  picker.

Dropped the now-unused `toast` import from `pick-collection.tsx`.

### Route registration

`app/_layout.tsx` gets a new `<Stack.Screen name="mood/pool/[id]"
options={{ animation: 'simple_push' }} />` alongside the existing
mood routes.

## Files changed

- `app/mood/pool/[id].tsx` (new) — view + edit screen for a single
  mood pool.
- `app/mood/pick-collection.tsx` — `onPick` routes to the new
  screen instead of activating + popping; `onCreate` routes to the
  new screen instead of `/shuffle/[id]`. Dropped `toast` import.
- `app/_layout.tsx` — register `mood/pool/[id]` route.
- `changes/README.md` — index row (added separately).

## Verification

JS-only change. Reload via:

```powershell
npx expo start --clear
```

If Metro keeps serving stale results after the route file addition,
follow `CLAUDE.md → "Metro stale-worker gotcha"` (kill 8081, wipe
`node_modules/.cache` + `$env:TEMP/metro-*` + `$env:TEMP/haste-map-*`).

On the device:

1. **View an existing pack pool:**
   - Mood → tap any pack on the bottom album strip → arrives in
     "Pick a pool" screen.
   - Tap a pack row.
   - **Expected:** new screen opens with header "Cosmic Dreams" (or
     whichever), "Use this pool for Mood Mode" CTA, 2-col grid of
     the pack's photos.
   - Tap a photo → routes to `/wallpaper/[id]` preview.
   - Tap "Use this pool for Mood Mode" → toast "✓ Mood pool: …",
     CTA flips to "Active for Mood Mode" (no nav).

2. **View an existing user pool with photos:**
   - Build a custom pool first via the main Mood tab's Custom →
     Gallery flow (puts a few photos in your mood collection).
   - Mood → bottom strip → "Build full album…" → tap your "My
     custom mood" row.
   - **Expected:** same layout, trash icon in header, "Add photos"
     button at the bottom, helper text "X of 10 photos · long-press
     to remove."
   - Long-press a photo → confirm dialog → Remove → photo
     disappears.

3. **Create a new pool:**
   - Mood → bottom strip → "Build full album…" → "Create your own
     pool" (top of the picker).
   - **Expected:** routes to the new pool screen with empty state
     "No photos yet" + "Add photos" CTA. Header shows "My mood
     pool" + trash icon. Pool is already selected as the active
     mood pool (the underlying behaviour from before).
   - Tap "Add photos" → "From Gallery" → pick 3 photos → return.
     Grid populates, helper text updates to "3 of 10 photos."
   - Tap "Use this pool for Mood Mode" → CTA becomes "Active for
     Mood Mode."

4. **Delete pool:**
   - Open a user pool → trash icon in header → confirm.
   - **Expected:** pool deleted, screen pops back, if it was the
     active mood pool the mood pointer is cleared.

## Notes

- The "From Internet" path inside the new screen currently bounces
  the user back to the main Mood tab's URL bottom sheet. The full
  in-screen URL paste flow is one of two follow-ups: it duplicates
  ~30 lines of bottom-sheet wiring from `app/(tabs)/mood.tsx`
  (`urlSheetRef` + `onSaveUrlPhoto`). Deferred so the rest of the
  rewire could ship faster; the `onAddFromUrlDirect(url)` helper
  is already wired and can be called from a future URL sheet.
- Pack-seeded pools are read-only here — `isUserPool` is false so
  no "Add photos" button shows. To customize a pack's photo set
  the user would create their own pool. Matches the way theme-pack
  also doesn't allow photo edits on built-in packs.
- Long-press remove works on direct-URI photos (gallery picks) the
  same way it works on catalog photos — the removal is a simple
  array filter on `photoIds`, no MediaStore call. The underlying
  photo stays in the user's gallery.
- Tap on a direct-URI photo calls `setAsWallpaper(uri, …, 'both')`
  directly instead of routing through `/wallpaper/[id]` (which
  doesn't recognise direct URIs because it queries
  `getPhotoById`). Pragmatic, single-tap apply; the wallpaper
  preview overlay is a small UX cost for the catalog-vs-user-URI
  split.
- The `Href` casts on `router.push` calls in this change are the
  same gotcha called out in CLAUDE.md — `typedRoutes` won't know
  about the new `/mood/pool/[id]` route until Metro regenerates
  `.expo/types`. The casts are harmless once regeneration runs.
