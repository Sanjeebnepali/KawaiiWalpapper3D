# 102 — Working image editor + clarified "Kawaii Baby" album save

## Problem

Owner, on the wallpaper bottom-sheet menu ("model bar"):

1. **"Edit Image" did nothing** — it only showed a toast,
   "✏️ Image editor is coming in a future update". Make it actually let the
   user edit the image. Constraint: keep every touched/created file under
   300 lines.
2. **"Save to Featured Folder" was unclear** — "I don't know what save to
   feature folder works, make it workable and tell me what it needs."

## Solution

### 1. Image editor (NEW `app/wallpaper/edit.tsx`, 258 lines)

A real editor built on `expo-image-manipulator`, which is **already a
dependency and already linked** (the mood detector uses it in
`lib/faceDetection.ts`), so **no new native module / no native recompile** —
just a JS bundle re-embed.

Flow:
- Receives `uri` + `id` route params.
- On mount, downloads the (usually remote) image to cache via
  `downloadToCache` — the manipulator needs a local `file://` URI — and a
  no-op `manipulateAsync` reads the dimensions for the crop math.
- Tools (each applies to the working copy and updates the preview): **Rotate
  L/R** (`rotate ±90`), **Flip H/V** (`FlipType`), **Fit phone** (centered
  9:16 crop computed from the current dimensions). **Reset** restores the
  original; it's disabled until an edit is made.
- Output: **Save to Gallery** (`saveToGallery`, honours the Featured-folder
  setting) or **Set Wallpaper** (`setAsWallpaper(..., 'both')`). Both take the
  edited local URI directly.
- `busy` guards every async path; an unmount ref prevents state updates after
  back-navigation.

Wiring:
- `components/WallpaperMenu.tsx` — `handleEdit` now `router.push`es
  `/wallpaper/edit` with `{ uri, id }` (cast `as Href` per the typedRoutes
  gotcha) instead of the placeholder toast.
- `app/_layout.tsx` — registered `wallpaper/edit` as a `simple_push` Stack
  screen (the static segment resolves before the sibling `wallpaper/[id]`
  dynamic route, so no route collision).

### 2. "Featured Folder" → "Kawaii Baby" album (clarity)

The action already worked: `handleFeaturedFolder` →
`saveToGallery(image, id, true)` →
`MediaLibrary.createAlbumAsync('Kawaii Baby', …)` (or adds to it if it
exists). The only problem was the opaque name. Renamed the menu label
`Save to Featured Folder` → `Save to "Kawaii Baby" Album`. What it does: saves
the wallpaper into a dedicated **"Kawaii Baby" album** in the device gallery
(so the user's saved wallpapers are grouped, not mixed into the camera roll).
What it needs: **gallery (MediaLibrary) write permission** — already requested
on first save; the album then shows up in the system Gallery/Photos app.

## Files changed

- `app/wallpaper/edit.tsx` — NEW editor screen (258 lines).
- `components/WallpaperMenu.tsx` — Edit navigates to the editor; Featured
  Folder label clarified (269 lines).
- `app/_layout.tsx` — registered the `wallpaper/edit` route (245 lines).

## Verification

- `npx tsc --noEmit` — no errors in the changed files.
- All touched/created files < 300 lines (258 / 269 / 245).
- Manual (after a release re-embed): open a wallpaper → ⋯ → Edit Image →
  rotate/flip/crop → Save to Gallery / Set Wallpaper. ⋯ → Save to "Kawaii
  Baby" Album → check the album appears in the gallery.

## Notes

- JS-only (expo-image-manipulator already linked) — `run` to re-embed the
  bundle into the release APK; no native recompile required.
- The crop is a fixed centered 9:16 (wallpaper-fit), not an interactive
  drag-box — an interactive crop UI needs gesture handling that would push the
  file past the 300-line cap. Rotate/flip/fit covers the common edits; an
  interactive crop can be a follow-up if wanted.
