# Production hardening: gallery crash-to-home fix + instant-apply

**Date:** 2026-05-19
**Type:** fix

## Problem

User's final pre-prod report: "I tried to make album but it redirect me
to home page of the phone when I pick a gallery. It doesn't apply
perfectly. Make a debugging this at last — this is production ready
one fix this."

Two distinct issues bundled together:

1. **Crash-to-home when picking from gallery.** Returning to the
   launcher = MainActivity died. On Vivo / MIUI / ColorOS this happens
   when the picker activity OOMs the host process during multi-select.
2. **"Doesn't apply perfectly":** picks land in the pool but the
   wallpaper doesn't change immediately. Users expect picking a photo
   to apply it; currently the photos only apply on the next mood
   notification tap or bg-task dispatch.

## Solution

### 1. SDK 55 API correctness + memory hygiene

`lib/galleryPicker.ts:pickGalleryImages` and `pickGalleryImage` were
calling `launchImageLibraryAsync` with `mediaTypes: m.MediaType ??
m.MediaTypeOptions?.Images`. In Expo SDK 55, `MediaType` is a TYPE
union (`'images' | 'videos' | 'livePhotos'`) — there's no runtime
export. `m.MediaType` evaluates to `undefined`, the code falls
through to the deprecated `MediaTypeOptions.Images` enum, and the
picker complains internally (warning + occasional native crash on
OEM galleries that strictly validate the option shape).

Fix: both helpers now pass `mediaTypes: ['images']` (the SDK 55+
forward-compatible string array form documented in
`ImagePicker.types.d.ts`). Removed `allowsEditing` from
`pickGalleryImages` since it's incompatible with
`allowsMultipleSelection` on iOS and a crash path on some Android
OEM galleries. Lowered `quality` to 0.8 (multi) / 0.9 (single) to
reduce the simultaneous decoded-bitmap footprint on Vivo / MIUI
devices where the picker pre-decodes the whole batch before returning.

Also tightened the call:
- `selectionLimit` is now clamped `Math.max(1, Math.min(10, limit))`
  — some OEM galleries reject limits > 10 with a hard crash.
- Promoted `console.warn` out of the `__DEV__` gate so logcat in a
  release APK shows the real exception when QA reports another crash.
- The result asset extractor handles null / missing-uri entries
  defensively instead of trusting the array shape.

### 2. Top-level try/catch on the Custom flow

`onPickFromGalleryForCustom` and `onSaveUrlPhoto` now have a wrapping
try/catch. Any unhandled rejection from `addPhotosToCustomMoodPool`,
`setAsWallpaper`, or the picker call itself is logged via
`console.warn` and surfaced to the user as a retry-friendly toast
instead of bubbling to React's uncaught-error path (which can blank
the screen on release).

### 3. Instant-apply the first picked photo

The most user-visible fix. When `addPhotosToCustomMoodPool` succeeds,
the handler now immediately calls
`setAsWallpaper(firstUri, 'custom-mood-${Date.now()}', 'both')` so the
phone's lock + home wallpaper change in the same gesture. This
matches user expectation ("I picked this photo so use it") and
removes the previous gap where the pool was updated silently and the
user only saw the change on the next notification tap or bg dispatch.

The instant-apply is wrapped in its own inner try/catch so an apply
failure doesn't roll back the pool addition — those photos are still
in the user's album and will be used on the next engine tick.

Toast text differentiates the three outcomes:
- `"✓ Added N photos · first one applied"` — happy path
- `"✓ Added N · applied as wallpaper"` — single-pick happy path
- `"Added N · couldn't apply (<reason>)"` — pool updated but
  wallpaper apply failed (e.g. permission revoked)

## Files changed

- `lib/galleryPicker.ts`
  - Both `pickGalleryImage` and `pickGalleryImages` now use
    `mediaTypes: ['images']` (SDK 55 array form, deprecated-enum-free)
  - Multi: `quality: 0.8`, dropped `allowsEditing`, `selectionLimit`
    clamped to `[1, 10]`
  - Single: `quality: 0.9`
  - `console.warn` no longer `__DEV__`-gated so release-APK
    crashes show up in `adb logcat`
  - Type widened so a null asset in the returned array is safe
- `app/(tabs)/mood.tsx`
  - Import `setAsWallpaper` alongside `downloadInternetImage`
  - `onPickFromGalleryForCustom`: top-level try/catch + immediate
    `setAsWallpaper(firstUri)` on success
  - `onSaveUrlPhoto`: same shape — try/catch + immediate apply of
    the first downloaded URI
  - Toast text rewritten to communicate the three outcomes per flow
- `changes/README.md` — index row (added separately)

## Verification

Rebuild + reinstall:

```powershell
npx expo run:android --variant release --no-bundler
```

On the device:

1. **Multi-pick smoke test:**
   - Mood → Choose album → Custom → From Gallery
   - Long-press a photo, tap 4 more. Hit Done.
   - **Expected:** OS picker closes, app foregrounds, toast
     `"✓ Added 5 photos · first one applied"`, and your home + lock
     wallpaper actually changes to the first picked photo within ~1 s.
   - **Old bug:** the app would either go to launcher (Vivo OOM) or
     return without a wallpaper change.

2. **Single-pick test:**
   - Custom → From Gallery → pick exactly one photo → Done.
   - Toast `"✓ Added 1 photo · applied as wallpaper"`. Wallpaper
     changes.

3. **URL test:**
   - Custom → From Internet → paste a valid image URL → Download.
   - Toast `"✓ Added 1 · applied as wallpaper"`. Wallpaper changes.

4. **Mixed-result URL test:**
   - Custom → From Internet → paste two URLs (one valid, one
     garbage) on separate lines → Download.
   - Toast `"✓ Added 1 · applied as wallpaper (1 failed)"`. The
     valid one's image becomes the wallpaper.

5. **Permission-denied test:**
   - Settings → revoke gallery access for the app → Mood → Custom →
     From Gallery.
   - Toast `"Gallery permission denied"`. No crash, no home-launcher
     redirect. App stays on Mood tab.

6. **Re-pick when pool is full:**
   - After step 1, pool has 5 + previous content. Repeat Custom →
     Gallery → pick another 6.
   - Toast `"✓ Added N photos · first one applied"` where N is
     however many slid in via the sliding-window eviction.

## Notes

- If the user STILL sees a launcher redirect after this fix, the most
  likely remaining cause is Vivo's background-app limit killing our
  process while the gallery picker is foreground. Workaround: have
  the user open **Phone Manager → App Battery Manager → Kawaii Baby
  Wallpapers HD → High background power consumption**, OR
  **Settings → Apps → Special access → Background app management → No
  restrictions**. That's a Vivo OEM setting we can't toggle from JS.
- The `console.warn` log lines now use the prefix `[galleryPicker]`
  or `[mood/custom]` so `adb logcat | grep -E
  "galleryPicker|mood/custom"` filters cleanly when reproducing.
- Instant-apply uses `'both'` (lock + home) intentionally — the
  custom-pool flow is a one-tap "use this" expression of intent. The
  Set-As-Wallpaper modal that lets the user pick lock-only / home-only
  still exists for the per-image preview screen; the Custom flow is
  the bulk happy-path.
- This change is JS-only. No native rebuild required, but a JS bundle
  re-embed (the `--no-bundler` release flow) is needed for the user
  to see the new behavior.
