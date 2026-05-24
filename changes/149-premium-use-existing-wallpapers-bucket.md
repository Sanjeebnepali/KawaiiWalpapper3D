# Premium collection — reuse the existing `wallpapers` bucket (premium/ folder)

**Date:** 2026-05-25
**Type:** fix

## Problem

Change 147 had the uploader create a NEW `premium` bucket. The owner already has a public
`wallpapers` bucket holding every other collection (e.g.
`…/public/wallpapers/mood/happy/001.webp`), so a separate bucket is redundant — and the
create step is what failed (`new row violates row-level security policy`, because it was run
with the anon key, which can't create buckets).

## Solution

Put the premium images in the EXISTING `wallpapers` bucket under a `premium/` folder, next to
the other collections — no new bucket.

- `constants/premiumCatalog.ts` — `PREMIUM_BUCKET` `'premium'` → `'wallpapers'`; new
  `PREMIUM_PREFIX = 'premium/'`; `premiumImageUrl` now builds
  `…/public/wallpapers/premium/<file>`.
- `scripts/upload-premium.mjs` — targets bucket `wallpapers`, uploads to `premium/<file>`;
  replaced the unconditional `createBucket` with `listBuckets` → only create if missing
  (so the existing bucket is used as-is, no create attempt). Sample URL updated.

The app builds premium URLs from those bundled constants, so this needs a rebuild to take
effect.

## Files changed

- `constants/premiumCatalog.ts` (bucket + prefix + URL)
- `scripts/upload-premium.mjs` (target bucket/prefix + list-then-create)

## Verification

`tsc --noEmit` → **0 errors**. Build + on-device: see commit.

## Notes

- The owner STILL needs the `service_role` key to run the uploader — writing to Storage
  (any bucket) requires it; the anon key can't upload. The change only removes the
  bucket-creation requirement, not the auth requirement.
- Run: `$env:SUPABASE_SERVICE_ROLE_KEY="<service_role>"; node scripts/upload-premium.mjs
  "C:\Users\Sanju\Downloads\premium"` → uploads to `wallpapers/premium/`.
