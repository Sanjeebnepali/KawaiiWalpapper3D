# SW catch-up on resume + Custom multi-select gallery & multi-URL

**Date:** 2026-05-19
**Type:** fix + feature

## Problem

Two issues from the user after 054 shipped:

1. **"I got notification regarding wakeup and sleep mode but it doesnot
   auto apply untill another shift change."** The Sleep/Wake daily
   notification fires at the user's wake-hour and sleep-hour (scheduled
   via `expo-notifications` `scheduleNotificationAsync` with a DAILY
   trigger — that part works). But the wallpaper apply only runs when
   the user TAPS the notification action, or when the bg-task runs the
   `runSleepWakeFallback`. On Vivo OriginOS the bg-task is OEM-throttled
   so the fallback may not run for hours. Net effect: notification
   shows, wallpaper doesn't change until the user finally taps a later
   notification at the next shift.

2. **"In moodbased I can't able to create album only select one image
   but I need to select 10 images whether from browser and internet and
   from our app gallery."** The 054 Custom button's "From Gallery"
   opened the OS picker in single-selection mode; "From Internet" took
   one URL per submission. The user had to tap Custom 10 times to fill
   a pool.

## Solution

### 1. Run mood bg-task on app resume (one-line fix for SW catch-up)

`hooks/useShuffleEngine.ts:useShuffleEngineHost` already had an
AppState `'active'` listener that called `runShuffleBackgroundOnce()`
on every resume. Swapped to `runMoodBackgroundOnce()` — which
internally calls `runShuffleBackgroundOnce` FIRST (returns early if it
applied), THEN executes `runSleepWakeFallback` + the context-mood
bg-path. So:

- Shuffle resume behavior unchanged (still catches up the moment app
  re-opens).
- SW fallback now also runs on app resume. If the user missed the
  wake-hour notification, opening the app at any point past wake-hour
  applies the wake wallpaper immediately (per-day stamp prevents
  re-fire later the same day).

This does NOT make SW apply WITHOUT the user opening the app. For that
we'd need Android `AlarmManager.setExactAndAllowWhileIdle` or extending
the shuffle FGS to also tick SW transitions — both require another
native rebuild and are documented as the proper follow-up. The
JS-only fix here covers the most common case: user wakes up, opens
their phone, opens the app or sees a notification, the wallpaper
changes immediately on the next resume rather than waiting for
"another shift change."

### 2. Multi-select gallery picker

New `pickGalleryImages({ limit })` in `lib/galleryPicker.ts`. Uses
`expo-image-picker`'s `allowsMultipleSelection: true` + `selectionLimit`
to put the OS picker in multi-select mode. Returns `{ uris: string[] }`
instead of a single URI. The existing `pickGalleryImage` (single-select)
is kept for the Sleep/Wake custom-pair picker which still picks one
image at a time.

The Custom button's "From Gallery" now calls
`pickGalleryImages({ limit: customPoolRemaining || 10 })` so the picker
shows exactly how many slots are open. User can pick up to that many in
one go, all are appended in a single `updateCollection` write.

### 3. Multi-URL paste

The "From Internet" sheet is now a multi-line `TextInput` (5 rows
minimum, paste-friendly). The submit handler splits the input on
whitespace / commas, downloads each in parallel via `Promise.all`,
filters successes from failures, and toasts a count like
`"✓ Added 7 from internet (1 failed)"` so the user knows how many of
their pasted URLs were valid.

### 4. Custom pool slot counter

The URL sheet's helper text now displays
`"N slots free in your custom pool"` when there's room, or
`"Pool is full — new picks will replace the oldest"` when at cap. Same
sliding-window behavior as before (newest at end, evict oldest at cap).

## Files changed

- `hooks/useShuffleEngine.ts`
  - Swap the AppState `'active'` listener from
    `runShuffleBackgroundOnce` to `runMoodBackgroundOnce`
- `lib/galleryPicker.ts`
  - Add `allowsMultipleSelection` to `ImagePickerLike` type
  - Add `pickGalleryImages({ limit })` returning `{ uris: string[] }`
- `app/(tabs)/mood.tsx`
  - Import the new `pickGalleryImages`
  - Replace single `addPhotoToCustomMoodPool` with batch
    `addPhotosToCustomMoodPool(uris)` (dedupe + slice + single
    `updateCollection` write)
  - New `customPoolRemaining` memo for the slot counter
  - `onPickFromGalleryForCustom` calls `pickGalleryImages` with the
    remaining-slots limit; toasts the count actually added
  - `onSaveUrlPhoto` parses multiple URLs (split on whitespace/comma),
    downloads in parallel, reports successes/failures
  - URL sheet `TextInput` becomes multi-line (`multiline`,
    `numberOfLines={5}`, `textAlignVertical="top"`, `minHeight: 120`)
    with a slot-count helper line
- `changes/README.md` — index row (added separately)

## Verification

JS-only — rebuild & reinstall the release APK:

```powershell
npx expo run:android --variant release --no-bundler
```

Once installed:

1. **SW catch-up:**
   - Mood → Sleep/Wake on, set wake hour to a time that just passed.
     Force-close the app. Wait for the wake notification to fire
     (should be near-instant since the wake hour just passed).
   - Do NOT tap the notification. Open the app from your launcher.
   - On launch, the wake wallpaper should apply within ~1 second
     (the `runMoodBackgroundOnce` on resume).
2. **Multi-select gallery:**
   - Mood tab → scroll to "Choose album" strip → tap **Custom** →
     **From Gallery**.
   - OS picker opens in multi-select mode. Long-press one photo, then
     tap up to N others (N = remaining slots).
   - Confirm. Toast says `"✓ Added N photos from gallery"`. Pool
     thumbnail in the strip and the Pool row at top update.
3. **Multi-URL paste:**
   - Tap **Custom** → **From Internet**. Sheet opens with a multi-line
     input. Paste two valid image URLs separated by a newline.
   - Tap Download. Toast says `"Downloading 2 images…"` then
     `"✓ Added 2 from internet"`.
   - Repeat with one valid + one garbage URL. Toast says
     `"✓ Added 1 from internet (1 failed)"`.
4. **Slot counter:**
   - The URL sheet's helper text matches the count in the Pool row.

## Notes

- **Proper SW auto-apply without opening the app** still needs native
  work. Cleanest path: extend `modules/shuffle-foreground` with a
  Kotlin `AlarmManager.setExactAndAllowWhileIdle` scheduler that
  fires at wake-hour / sleep-hour, decodes the SW image URI, and
  calls `WallpaperManager.setBitmap` directly. Independent of the
  FGS lifecycle so users with only SW (no shuffle) also benefit.
  On Vivo / MIUI / ColorOS the exact-alarm permission may need to be
  requested at runtime via the `SCHEDULE_EXACT_ALARM` permission
  (Android 12+) and a settings deep-link if denied. Defer to a
  future change.
- The free-tier limit of one custom mood collection still applies —
  multi-select just lets the user fill that one collection faster.
  Built-in theme packs remain free and unlimited via the strip.
- `Promise.all` for URL downloads is fine for ≤10 URLs; for larger
  batches we'd want a concurrency limiter to avoid spiking memory
  with parallel `fetch` + base64 work. Out of scope here.
- JS-only change. No native rebuild required if the JS bundle is
  re-embedded by re-running the existing release-build command.
