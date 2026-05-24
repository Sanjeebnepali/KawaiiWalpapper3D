# "Premium Collection" tab → real premium grid + taller (portrait) grid cards

**Date:** 2026-05-25
**Type:** fix

## Problem

1. The home **"Premium Collection" top tab** still showed the OLD images: it routed to
   `/wallpapers/dual` (the legacy dual-pair mock screen using `dualWallpapers`), not the new
   premium collection wired in 147–151.
2. The category/premium + search grids used **1:1 square cells**, which looks cheap — the
   owner wants taller portrait cards (like other premium wallpaper apps), keeping 2 columns.

## Solution

1. `components/TopTabs.tsx` — `ROUTE_BY_TAB.dual` `'/wallpapers/dual'` → `'/category/premium'`,
   so the "Premium Collection" tab opens the real premium grid (Supabase `premium/` images,
   gold diamonds, paywall on apply).
2. Taller cells (1:1 → **1.5×** portrait, matching the couple + 2D grids):
   - `app/category/[id].tsx` — `cellH = cellW` → `Math.round(cellW * 1.5)`. Covers every
     category browse incl. `/category/premium`.
   - `app/search.tsx` — same.
   The other grids were already portrait (mood 1.3, theme-pack 1.4, 2D 1.5, favorites 1.4,
   couple 1.5) and were left as-is; the home `BestPicksGrid` is already a tall 3-col portrait
   (aspect 0.52) and is unchanged.

## Files changed

- `components/TopTabs.tsx` (tab route)
- `app/category/[id].tsx`, `app/search.tsx` (cell height 1:1 → 1.5×)

## Verification

`tsc --noEmit` → **0 errors**. `jest` → **144 passed / 9 suites**. Build + on-device: see
commit.

## Notes

- `app/wallpapers/dual.tsx` is now unreachable via the tab (still reachable by direct route).
  Left in place; can be removed in a later cleanup if the dual-pair feature is retired.
- 2 columns kept (width unchanged); only height grew, per the request.
