# 107 — Couple proximity wallpaper actually applies + live distance

## Problem

After the crashes were fixed (105/106), the couple proximity feature ran but:
1. The **distance felt static** — frozen at the first reading.
2. The **wallpaper never changed** when partners were near.

Prod-visible logging (temporarily added, then removed) pinned both exactly:

```
[cpl/loc] fix … → dist=5.65 prox=near partner=true            ← proximity logic 100% correct
[cpl/wp] apply called: status=linked prox=near role=a pack=golden-beach
[cpl/wp] applying together uri=assets_couple_pack2together     ← ⚠ NOT a file path
[cpl/wp] setAsWallpaper result ok=false msg="Call to function 'ExponentFileSystem.downloadAsync' has been rejected."
```

### Root causes

1. **Bundled image never resolved to a real file.** The couple pack images are
   bundled `require()` PNGs. On Android, `expo-asset` keeps a bundled image's
   `localUri` as the bare **drawable resource name** (`assets_couple_pack2together`)
   for RN `<Image>` backward-compat, and marks the asset `downloaded = true` — so
   `Asset.downloadAsync()` short-circuits and never materialises a real file.
   `resolveCoupleImageUri` returned that resource name; the native wallpaper-setter
   (and `FileSystem.downloadAsync`) can't read it → apply always failed.
2. **Distance static / Vivo got no fix.** The location stream used
   `timeInterval: 30s`, `distanceInterval: 25m`, `pausesUpdatesAutomatically: true`
   — so a stationary phone got NO updates after the first (and some OEMs, e.g. Vivo
   Funtouch, delivered none at all), leaving distance frozen / `proximity=unknown`
   → no apply on that phone.

## Solution

`lib/coupleWallpaper.ts` — `resolveCoupleImageUri`: when the asset's `localUri`
isn't a usable `file://` / `content://` / `http(s)` URI (i.e. it's the bare
drawable name), clear the `downloaded` flag + `localUri` and force
`downloadAsync()`, which copies the embedded resource to a real cache file
(`file:///…/cache/ExponentAsset-<hash>.png`). The wallpaper-setter can decode
that. **This is the fix that makes the couple wallpaper apply** (verified
`setAsWallpaper result ok=true` on BOTH phones).

`lib/coupleLocation.ts` — live, reliable location:
- `timeInterval: 5s`, `distanceInterval: 0` → updates even when stationary
  (distance feels live instead of frozen).
- `pausesUpdatesAutomatically: false` → OEMs can't pause a still phone's stream.
- **Seed an immediate position** on `startCoupleLocation` via
  `getCurrentPositionAsync` (fallback `getLastKnownPositionAsync`),
  fire-and-forget → the dashboard shows a distance within seconds instead of
  waiting for the stream's first emit. This is what got the Vivo (slow/paused
  GPS) working: it seeded its own fix, the partner's arrived via realtime,
  proximity flipped to `near`, and the together wallpaper applied.

## Files changed

- `lib/coupleWallpaper.ts` — `resolveCoupleImageUri` forces real file
  materialisation for bundled Android assets.
- `lib/coupleLocation.ts` — 5s/0m interval, `pausesUpdatesAutomatically:false`,
  immediate-position seed.

## Verification (real two-phone test)

- Xiaomi (role a, host) AND Vivo (role b) both log
  `applying together uri=file:///…ExponentAsset-…png` →
  `setAsWallpaper result ok=true "✓ Applied to lock + home"`.
- Owner confirmed the Xiaomi's home/lock screen changed to the couple image;
  Vivo applied once it got a GPS fix.
- `nativeAvailable=true` confirmed — the `WallpaperSetter` native module works
  (also resolves the original "manual apply does nothing" report: the engine is
  healthy; the failure was always the bundled-image file path).

## Notes

- The couple images are bundled placeholders in `assets/couple/`. The slot type
  is `number | string`, so swapping to hosted **Supabase Storage URLs** later is
  a drop-in (string sources skip the asset-materialisation path entirely and go
  straight through the existing http download). See [[real-images-hosting-plan]].
- `distanceInterval: 0` + 5s is a battery trade-off chosen for a live-feeling
  distance while the feature is active; revisit if battery becomes a concern.
