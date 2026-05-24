# Revert the Featured "2D Kawaii" card to a working image (fix black card)

**Date:** 2026-05-25
**Type:** fix

## Problem

Change 153 pointed the Featured "2D Kawaii" card at
`wallpapers/2d/nervous/33bfb1fb-…png`, but that image was never uploaded (the
service_role key was never added), so the card rendered **black** (404 object).

## Solution

Removed the `FEATURED_2D_ID` / `FEATURED_2D_IMAGE` constants + the `'2D Kawaii'`
special-case in `featured` + the `getPhotoById` branch in `constants/mockData.ts`.
The Featured "2D Kawaii" card falls back to its previous working catalog image
(`2d/mixed` first photo). Will re-point to the real image once it's actually in
the bucket at a confirmed URL.

## Files changed

- `constants/mockData.ts`

## Verification

`tsc --noEmit` → **0 errors** (no dangling `FEATURED_2D` refs). BUILD SUCCESSFUL,
installed, launches clean — card no longer black.
