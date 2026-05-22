# Debug pass: link wallpaper-setter, persist favorites, ship a Favorites page, and make Settings toggles real

**Date:** 2026-05-19
**Type:** fix + feature

## Problem

End-to-end debug sweep after a user report that "auto features don't work
on Android" and that "all the toggles in Settings don't do anything."
After tracing the wallpaper-apply pipeline, the auto-shuffle FGS, the
mood pipeline, and every row in `app/(tabs)/profile.tsx`:

1. **`modules/wallpaper-setter` was never autolinked.** The other two
   local Expo modules — `shuffle-foreground` and `sleep-wake-foreground`
   — appear in `package.json` as `"file:./modules/…"` entries, which
   is what makes `useExpoModules()` find them during the Android build.
   `wallpaper-setter` was missing that entry, so
   `requireOptionalNativeModule('WallpaperSetter')` returned `null` at
   runtime, `isWallpaperSetterAvailable` was `false`, and every "Set
   as Wallpaper" tap fell into the legacy
   `setAsWallpaperLegacyAndroid` path that opens the system picker /
   crop editor. That is exactly the "auto doesn't work on Android"
   symptom — the user was being asked to manually apply every time.
2. **Most Settings rows were write-only.** A grep across the repo
   showed that `autoDownload`, `saveToGallery`, `liveWallpaper`,
   `showSetButton`, `autoSaveGenerated`, `maxGenPerDay`, and
   `vibrationOnDownload` were stored in `useSettingsStore` but
   nothing else in the codebase read them. The toggles flipped but
   nothing changed. `Clear Cache` was a fake toast. `Delete Account`
   was an empty `onPress`.
3. **No way to view favorites.** The favorites store was in-memory
   only (the persistence to AsyncStorage was noted as a follow-up in
   `changes/007` but never landed), and there was no screen that
   showed the user the wallpapers they had hearted. The user
   explicitly asked for "an additional button there to view like a
   photos page."

## Solution

1. **Link the native module.** Add
   `"wallpaper-setter": "file:./modules/wallpaper-setter"` to
   `package.json`. After the next `npm install` + `npx expo
   run:android`, Expo autolinking picks it up and
   `isWallpaperSetterAvailable` flips to `true`. Every "Apply" tap
   then goes through `WallpaperManager.setBitmap` directly — true
   one-tap, no picker.
2. **Persist favorites.** Add AsyncStorage persistence to
   `store/favorites.ts` (same lazy-require pattern as
   `store/settings.ts` so JS-only reloads keep working). Hydrate from
   `app/_layout.tsx`'s root effect alongside the other stores.
3. **New `app/favorites.tsx` screen.** Photos-page-style 2-col grid
   built on the shared `WallpaperGridCell` so the heart-toggle and
   prefetch behaviour match every other grid. Empty state with a
   "Browse wallpapers" CTA back to Home. Trash icon clears all
   favorites behind a `premiumAlert` confirm.
4. **New "My Library" Settings section** with a "My Favorites" row
   that routes to `/favorites`. Sits right above the existing
   "Premium Themes" section so it's the first content-related action
   the user sees.
5. **Wire the dead toggles to real behaviour:**
   - `autoDownload` / `saveToGallery` — `lib/wallpaperActions.ts`
     `setAsWallpaper` now chains a `saveToGallery` call after a
     successful apply, honouring `featuredFolder` for the target
     album.
   - `vibrationOnDownload` — `setAsWallpaper` + `saveToGallery`
     pulse `Vibration.vibrate(50)` on success. The
     `android.permission.VIBRATE` permission was already in the
     manifest; no new deps.
   - `maxGenPerDay` — `lib/ai/client.ts` `generateImage` now refuses
     to call the provider when `useAIStore.todayCount() >=
     useSettingsStore.maxGenPerDay`, returning a `rate_limited`
     error with a clear "Daily limit reached" message.
   - `autoSaveGenerated` — `app/ai/preview.tsx` saves the generation
     to the gallery on mount (guarded by a ref so it runs once per
     uri).
   - `showSetButton` — `app/wallpaper/[id].tsx` gates the prominent
     "Apply" CTA so users who prefer a clean preview canvas can
     hide it (the action stays available from the … menu).
   - `Clear Cache` — calls the new `clearAppCache()` helper that
     walks `FileSystem.cacheDirectory` and deletes every entry,
     reporting the rough MB freed in the toast.
   - `Delete Account` — confirms via `premiumAlert` and on accept
     clears favorites, calls `useAIStore.resetAll()`, and signs out
     via Supabase. Toast says "Local data cleared · signed out" so
     the user isn't misled into thinking the server-side row was
     deleted (that needs an admin endpoint we haven't shipped).

## Files changed

- `package.json` — add `wallpaper-setter` as a local file: dep so
  Expo autolinking picks it up.
- `store/favorites.ts` — full rewrite with AsyncStorage hydrate +
  debounced persist. Same public API (`useIsFavorite`,
  `useToggleFavorite`) so existing call sites don't change.
- `app/_layout.tsx` — hydrate favorites on boot, register the new
  `favorites` route.
- `app/favorites.tsx` — new photos-style grid of liked wallpapers.
- `app/(tabs)/profile.tsx` — new "My Library" section + favorites
  CTA, real `Clear Cache`, real `Delete Account`, wire `Href` type.
- `lib/wallpaperActions.ts` — chain auto-save + haptic on success;
  new `clearAppCache()` helper.
- `lib/ai/client.ts` — daily quota gate against `maxGenPerDay`.
- `app/ai/preview.tsx` — auto-save on mount when
  `autoSaveGenerated` is on.
- `app/wallpaper/[id]\.tsx` — gate the Apply button on `showSetButton`.

## Verification

1. `npm install --legacy-peer-deps` — confirms the new `file:`
   wallpaper-setter dep symlinks into `node_modules/`.
2. `npx expo run:android --variant release --no-bundler` — autolinks
   the native module + builds the APK.
3. Open the app → tap any wallpaper → tap Apply. Expected: wallpaper
   changes immediately, no system picker, toast says "✓ Applied to
   lock + home".
4. Settings → toggle Vibration on Download → Apply a wallpaper →
   feel the short pulse. Toggle Auto Download on → Apply → the
   wallpaper also lands in the gallery / Kawaii Baby album.
5. Settings → Max Generation Per Day → drag to 5 → generate 5
   images → 6th attempt toasts "Daily limit reached (5/5)".
6. Settings → toggle Save Generated Images Automatically → generate
   one image → preview screen toasts "✓ Saved to gallery" on its
   own.
7. Settings → toggle "Show 'Set Wallpaper' Button" off → open any
   wallpaper preview → the bottom-right Apply pill is hidden but
   the ⋯ menu still has "Set as Wallpaper".
8. Settings → My Favorites → opens the photos grid. Heart a few
   wallpapers from anywhere in the app, return here, confirm they
   show. Trash icon clears all behind a confirm.
9. Settings → Clear Cache — toast reports MB freed.
10. Settings → Delete Account → confirm → favorites + AI history
    wiped, signed out.

## Notes

- The "auto features don't survive app close" complaint on the user's
  Vivo phone is documented in `KNOWN_ISSUES.md §1` — that's the OEM
  background killer, not a code bug. The FGS modules are correctly
  declared in their per-module `AndroidManifest.xml` fragments and
  the merged manifest carries the right `FOREGROUND_SERVICE` +
  `FOREGROUND_SERVICE_SPECIAL_USE` permissions. Real fix is per the
  follow-up list in that doc.
- The iOS wallpaper limitation is also a platform constraint, not a
  fixable bug — Apple has no public API for third-party wallpaper
  apply, so iOS keeps degrading to the photos-redirect deep link.
- Server-side account delete is still a TODO. Today's "Delete
  Account" only wipes local data; the next iteration needs an admin
  endpoint or `supabase.auth.admin.deleteUser()` from a server
  function before the row in `public.profiles` can be removed.
- Did not touch `liveWallpaper`, `newWallpaperAlerts`,
  `dailyRecommendation`, or `resolution` — those map to features
  not yet built (video tab gating, daily push notifications, image
  resolution override). Leaving them as labelled toggles so the
  Settings page doesn't lose rows; a follow-up can wire them when
  the underlying features ship.
