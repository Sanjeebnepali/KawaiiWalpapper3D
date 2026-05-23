# App icon no longer cropped (padded adaptive foreground)

**Date:** 2026-05-24
**Type:** fix

## Problem
The owner reported the launcher icon gets **cropped** and wants the full detective-girl logo visible (referenced the app-drawer screenshot). Change 113 deliberately fed the full-bleed `app-icon.png` straight into `android.adaptiveIcon.foregroundImage`. But Android adaptive icons only guarantee the **inner ~66%** of the foreground survives the launcher mask (squircle/circle) — the outer ~25% on every edge is clipped. Since the design fills the canvas edge-to-edge (the pink frame, the hair-bun mascot, the magnifying glass, and the corner sparkles all reach the border), the launcher chopped off the frame and parts of the character.

Change 113's own note flagged the proper fix for this exact symptom: "a properly-layered adaptive icon … flagged as an easy follow-up if needed." This is that follow-up.

## Solution
Built a **padded adaptive foreground** so the whole design lands inside the mask's safe zone:

1. Generated `assets/app-icon-foreground.png` (1024×1024) — the full `app-icon.png` scaled to **84%** and centered on a transparent canvas (82 px transparent margin per side; content bbox `82,82 → 942,942`).
   - 84% was chosen by rendering candidates (78 / 82 / 84 / 86 / 92%) through simulated **squircle** *and* **circle** masks and comparing: 78% looked too inset/small; 86%+ began clipping the pink frame's corners on a circle mask; 84% fills the tile like a real app icon while keeping the full frame + character visible on squircle masks (the owner's Vivo Funtouch and Samsung One UI both use squircle).
2. `app.json` → `android.adaptiveIcon`:
   - `foregroundImage`: `./assets/app-icon.png` → **`./assets/app-icon-foreground.png`**
   - `backgroundColor`: `#131313` → **`#000000`** — the design's corners (outside its rounded frame) are pure black, so a pure-black background makes the inset margin seamless: there's no visible seam between the design's black corners and the tile background, so the icon reads as full-bleed even though it's padded.
3. `expo.icon` stays the full-bleed `./assets/app-icon.png` — iOS rounds the already-rounded design with its own superellipse mask and does **not** apply Android's safe-zone shrink, so full-bleed is correct there (and drives the legacy pre-Android-8 square mipmaps too).

## Files changed
- `assets/app-icon-foreground.png` — **new** 84%-scaled, centered, transparent-padded adaptive foreground.
- `app.json` — `adaptiveIcon.foregroundImage` → padded asset; `backgroundColor` → `#000000`.

## Verification
- Composited the final `app-icon-foreground.png` over `#000000` and applied a squircle mask (matching the real launcher pipeline): the entire pink frame + character render with no clipping, filling the tile cleanly.
- **`android/` is currently absent**, so the next `expo run:android` will auto-run `expo prebuild` and regenerate the adaptive icon resources from this config — meaning the fix applies on the next build with **no manual prebuild needed** (this avoids the change-115 stale-resource trap, which only bit because `android/` already existed then).
- On device: home-screen / app-drawer icon should show the full logo masked to the launcher shape, not cropped. (Clear the launcher icon cache or reboot if Android still shows a cached old icon.)
- The notification icon (the white heart from change 114) is untouched.

## Notes
- The screenshots the owner shared still showed the **default green robot** in both the drawer and the notification shade — those predate the change-115 rebuild (which is the commit that first made any icon config actually reach the native project). The crop this change fixes is the issue that surfaces *after* the brand icon is applied.
- Generated with a one-off Pillow script (`Pillow` + `numpy` were pip-installed locally for the resize/compositing/mask-preview work; not added to the project).
- If a future logo swap changes the artwork's framing, regenerate the foreground at the same 84% scale (or re-tune via the same squircle/circle preview comparison).
