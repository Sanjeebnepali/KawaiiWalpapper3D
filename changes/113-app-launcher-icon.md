# App launcher icon (home-screen / drawer icon)

**Date:** 2026-05-24
**Type:** feature

## Problem
`app.json` set no `expo.icon` and the Android `adaptiveIcon` had only a `backgroundColor` (no `foregroundImage`), so the phone showed a default launcher icon. The owner wants the detective-girl logo to be the actual app icon on the home screen / app drawer.

## Solution
- Generated `assets/app-icon.png` — the supplied 1254×1254 logo resized to a full-bleed 1024×1024 PNG (the required icon size).
- `app.json`:
  - `expo.icon: "./assets/app-icon.png"` — drives the iOS icon and the Android legacy mipmaps.
  - `android.adaptiveIcon.foregroundImage: "./assets/app-icon.png"` (kept `backgroundColor: "#131313"`).
- Used the logo **full-bleed** (not padded) for the adaptive foreground on purpose: the logo's corners are opaque black (the area outside its rounded-square frame). A padded foreground would show black blobs in the icon corners; full-bleed lets Android's launcher mask (squircle/circle) clip those black corners away — which is exactly what they're there for.
- Used a separate filename (`app-icon.png`, not `icon.png`) so the `expo-notifications` plugin's existing `./assets/icon.png` reference is untouched — the notification icon behavior is unchanged (no white-square regression).

## Files changed
- `assets/app-icon.png` — new full-bleed 1024×1024 launcher icon.
- `app.json` — added `expo.icon` and `adaptiveIcon.foregroundImage`.

## Verification
- **Requires a native rebuild** (`run`) — launcher icons are baked at build time; a JS reload won't change them. After install, the home-screen / app-drawer icon should be the detective-girl logo, masked to the launcher's icon shape.

## Notes
- Because the source is a pre-rounded icon with black corners (rather than separate background + transparent foreground layers), the adaptive result depends on the launcher's mask shape. On a squircle/rounded-square mask (typical, incl. Vivo Funtouch) it looks like the intended icon; a strictly circular mask will crop a little more of the frame. If any black slivers show at the corners on this device, the fix is a properly-layered adaptive icon (transparent-background girl + separate gradient background) — flagged as an easy follow-up if needed.
