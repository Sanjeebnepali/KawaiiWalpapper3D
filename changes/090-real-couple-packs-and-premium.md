# Real couple packs (bundled) + production-ready Couple Premium gate

**Date:** 2026-05-21
**Type:** feature

## Problem

Owner supplied the real Couple-page artwork — three folders in `Downloads`
(`couple-img1`, `couple--img2`, `couple--img3`), each a clean **triptych**:
a Boy solo, a Girl solo, and the two **Together**. Asks:

1. Remove all the default (picsum placeholder) couple images and use these.
2. On the Couple tab, the user should see **only the Together image** — never
   the single Boy/Girl halves.
3. After tapping a couple, open the **preview** that shows the Boy and Girl
   singles **separately** so each partner picks the half that's theirs.
   ("Logic already implemented — just make it professional and premium.")
4. The pairing flow: one partner buys premium → gets the couple code → shares
   it → the other pastes it → the pack unlocks for both, and stays unlocked
   until the subscription ends (no repeat purchase/prompt).
5. The subscription must sit **in parallel, not affecting the code**, and be
   **bypassed in testing** but ready for **production**.

## Solution

The whole couple-proximity feature (code generate/accept, premium gating,
partner inheritance, proximity wallpaper swap) already existed (changes/077,
078) — it just ran on picsum placeholders. This change wires in the real art
and hardens the premium gate; it does **not** rebuild the feature.

**Bundled real images (`assets/couple/` + `constants/couplePacks.ts`):**
- Copied the 9 PNGs into `assets/couple/packN-{boy,girl,together}.png`.
  Mapping was read off the images themselves:
  - Pack 1 `Lakeside Picnic` (img1) — sunset picnic by a lake.
  - Pack 2 `Golden Beach` (img2) — barefoot on the shore at sunset.
  - Pack 3 `Valentine Hearts` (img3) — roses + heart balloons.
  Boy = role `a`, Girl = role `b` in every pack.
- `couplePacks` rewritten from 6 picsum packs to these **3 real packs**, each
  slot a `require()` of the bundled PNG. New image type
  `CoupleImageSource = number | string` so a later move to hosted URLs
  (Supabase Storage) is a drop-in — swap the `require(...)` for a URL string,
  nothing else changes. `couplePacks.ts` no longer imports `picLarge`.
- `coupleWallpapers` (in `mockData`) now **derives from the packs** — one card
  per pack, **Together image only**. The placeholder 16-title list is gone.

**Couple tab grid (`app/(tabs)/couple.tsx`):**
- New dedicated `CoupleCard` (the shared `WallpaperGridCell` is URL-only and
  prefetches strings — incompatible with bundled modules). Shows only the
  Together image with an accent glow + "Couple" badge + "Tap to pick your
  side". Tapping routes to `/couple/preview?packId=…`.

**Preview = "pick your side" (`app/couple/preview.tsx`, rewritten):**
- Together hero on top, then the **Boy / Girl** solo halves as two selectable
  cards (check mark + accent border on the chosen one). Premium polish:
  gradients, accent glow, clear copy.
- Not linked → CTA `Pair as {side} →` carries `packId`+`role` to setup.
- Linked (opened from the dashboard) → falls back to the active pack + the
  user's own role and shows the live proximity status instead.
- `setup.tsx` reads `?packId` + `?role` and pre-selects the pack/side.

**Production-ready subscription, bypassed for testing (parallel layer):**
- New `constants/billing.ts` → single switch `SUBSCRIPTIONS_ENABLED = false`
  (testing: paywall bypassed; flip to `true` for production — one line, no
  feature-code changes).
- New `lib/billing.ts` → `hasCouplePremium()` (combines the switch with the
  persisted entitlement) + `purchaseCouplePremium()` (stub with the exact
  RevenueCat seam to fill in). `gateCouplePremium` (PremiumLock) and the
  server-side check in `lib/couple.ts:createCoupleCode` now call
  `hasCouplePremium()`. Partner inheritance + "stays unlocked until the sub
  ends" already hold (`acceptCoupleCode` sets `isCouplePremium`, persisted,
  not revoked on unlink).

**Wallpaper-setter ↔ bundled assets (`lib/coupleWallpaper.ts`):**
- Added `resolveCoupleImageUri()` — passes string URIs through, and
  materialises `require()` modules to a `file://` URI via **expo-asset** (added
  to `package.json`, hoisted by `npm install --legacy-peer-deps`; native side
  already ships in the Expo runtime). `applyProximityWallpaper` + the precache
  now resolve through it, so the existing proximity auto-apply keeps working
  with bundled art.

## Files changed
- `assets/couple/pack{1,2,3}-{boy,girl,together}.png` (new) — 9 real images.
- `constants/couplePacks.ts` — 3 real bundled packs; `CoupleImageSource` type;
  `soloImageForRole()`; dropped `picLarge` import.
- `constants/mockData.ts` — `coupleWallpapers` derives from packs (Together
  only); imports `couplePacks`.
- `constants/billing.ts` (new) — `SUBSCRIPTIONS_ENABLED` switch.
- `lib/billing.ts` (new) — `hasCouplePremium()` / `purchaseCouplePremium()`.
- `components/PremiumLock.tsx` — `gateCouplePremium` → billing layer + real
  "Subscribe" purchase path.
- `lib/couple.ts` — `createCoupleCode` gate → `hasCouplePremium()`.
- `lib/coupleWallpaper.ts` — `resolveCoupleImageUri()`; apply + precache use it.
- `app/(tabs)/couple.tsx` — Together-only `CoupleCard` grid → preview.
- `app/couple/preview.tsx` — rewritten "pick your side" screen.
- `app/couple/setup.tsx` — reads `packId`/`role` params; `Image` sources accept
  bundled modules.
- `app/couple/dashboard.tsx` — `Image` sources accept bundled modules.
- `package.json` — add `expo-asset` `~55.0.17`.

## Verification
- `npx tsc --noEmit`: 0 errors in changed files (9 total errors all
  pre-existing in untouched files — unchanged count vs. changes/088/089).
- expo-asset confirmed hoisted to `node_modules/expo-asset` (`55.0.17`).
- On device (after a Metro `--clear` restart or a release rebuild): Couple tab
  shows 3 cards, Together image only; tap → preview shows Boy/Girl singles to
  choose from; "Pair as …" → setup pre-selects the pack + side; in testing
  mode the code generates with no paywall.

## Notes
- **Metro / rebuild:** new bundled assets + the `expo-asset` dep need a Metro
  `--clear` restart (dev) or a release rebuild (`run`) to appear on device.
- **App size:** the 9 PNGs add ~18 MB to the bundle. Acceptable for a fixed
  premium set, and they work fully offline. If size matters later, flip the
  `require(...)`s to hosted URLs — `CoupleImageSource` already allows it.
- **Going to production:** set `SUBSCRIPTIONS_ENABLED = true` in
  `constants/billing.ts` and fill in `purchaseCouplePremium()` with the real
  RevenueCat/Play Billing call. Nothing else changes.
- The boy/girl half a user picks in the preview becomes their `role` at
  pairing; the existing proximity engine then shows the solo half when apart
  and the Together image when close.
