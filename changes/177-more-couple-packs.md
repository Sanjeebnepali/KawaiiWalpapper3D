# 177 — Expand couple packs from 3 → 12 (hosted on Supabase)

**Date:** 2026-05-28
**Type:** content (JS-only)

## Problem

User: the Couple Theme only had 3 packs — "update images in the couple theme so
the user gets a better experience rather than only 3." They supplied a folder
(`Downloads/couple___walpap`) of new couple wallpaper sets.

## What the folder contained

13 `imgN` subfolders. After inspection:

- **9 valid triptychs** — each a coordinated `together` (both characters) +
  `boy`-solo + `girl`-solo set, which is exactly the shape the couple proximity
  feature needs (`togetherImage` when near, role-specific solo when apart).
- **Skipped:** `img1`/`img2` (only 2 unique images — incomplete), `img12`
  (byte-identical duplicate of `img10`, confirmed via md5), and `img13` (its
  boy-solo is a blue-haired café boy that doesn't match the brown-haired seaside
  boy in its `together` image — the two solos must read as the same couple or the
  role-picker preview looks broken).

## Solution

**Hosted, not bundled.** Each set's 3 PNGs (~2 MB each, ~50 MB total) were
uploaded to the existing public `wallpapers` Supabase bucket at
`couple/<pack-id>/{together,boy,girl}.png` via `scripts/upload-file.mjs`
(service_role key from `.env`). Bundling all 27 would have added ~50 MB to the
APK; hosting keeps it lean. `CoupleImageSource = number | string` already
supports URL sources as a drop-in — `resolveCoupleImageUri` + `downloadToCache`
fetch+cache them, and `precacheActiveCouplePack` pre-downloads the active pack on
link/pick so the locked-screen apply still works. The original 3 packs stay
bundled (guaranteed offline).

9 new `CouplePack` entries appended to `constants/couplePacks.ts`, each built
from a `hostedCouple(id, slot)` helper (URL from `EXPO_PUBLIC_SUPABASE_URL`, same
convention as `mockData.ts`/`premiumCatalog.ts`). Boy = role 'a', Girl = role 'b'
throughout, matching the existing packs.

New packs: Painting Date, Station Reunion, Sing Together, Bookshop Date,
Festival Fireworks, Photo Booth, Love Letters, Sunset Meadow, Golden Fields.

The couple-tab grid (`coupleWallpapers` in `mockData.couple.ts`) and the pack
picker both derive from `couplePacks`, so all 12 packs appear automatically — no
other code changed.

## Files changed

- `constants/couplePacks.ts` — 6 new accent consts, `hostedCouple` URL helper,
  9 new pack entries (3 → 12 packs).
- Supabase `wallpapers` bucket — 27 new objects under `couple/<id>/`.

## Verification

- All 27 uploads succeeded; each public URL probed with
  `curl -o /dev/null -w '%{http_code}'` → **27/27 return 200**.
- `npx tsc --noEmit` → exit 0, no errors. `npm test` unaffected (203 pass).
- Release APK rebuilt + installed; Couple tab shows 12 packs.

## Notes

- JS-only — no native change. A rebuild is only needed to re-embed the JS bundle
  into the release APK.
- First view of the Couple tab now fetches up to 12 `together` images (~24 MB)
  before they cache; expo-image lazy-loads visible cells. A future optimisation
  could serve `.webp` instead of `.png` to cut first-load bandwidth.
- Source folder had duplicate/incomplete sets (`img1`/`img2`/`img12`) and one
  mismatched set (`img13`); these were deliberately excluded for quality.
