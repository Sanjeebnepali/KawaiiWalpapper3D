# 100 — Gallery auto-save default OFF + lock curated-pack photos

## Problem

Owner reported two issues:

1. **Wallpapers auto-save to the gallery without consent.** "Images get
   downloaded to the gallery although I didn't turn on autosave or
   autodownload, but still some set-wallpaper images get downloaded."

2. **Default (curated) theme-pack albums let users swap the photos.** When you
   open a pack's album you get options to choose other photos *and* set a
   timer. The timer is wanted, but the curated images should be fixed
   (developer-owned). Photo-choosing should exist only in the "create your own"
   flow. Framed as a premium-content concern.

## Root cause

1. Settings has two toggles that both feed `maybeChainSaveToGallery`
   (`lib/wallpaperActions.ts:297`), which saves a copy after every successful
   apply when **either** is on:
   - `autoDownload` — default OFF
   - `saveToGallery` ("Always save") — **default ON**

   Because `saveToGallery` defaulted to ON, every wallpaper the user set was
   silently copied to the gallery. The manual "Save to Gallery" button in the
   wallpaper menu ignores this setting (it always saves on tap), so the
   setting's *only* effect was the unwanted auto-save-on-apply.

2. The collection editor `app/shuffle/[id].tsx` is opened for **both** built-in
   packs (via the gear / long-press on a Theme Pack card → `onConfigurePack` →
   `ensureBuiltinPackCollection`) **and** user-created collections. It rendered
   the full photo picker (Gallery / Internet / in-app catalog grid) for both,
   so users could replace curated pack images. The discriminator already
   exists: built-in packs carry `seedPackId`; user collections don't. The mood
   pool screen (`app/mood/pool/[id].tsx`) already gates editing on this via
   `isUserPool` — the shuffle editor just didn't.

## Solution

### Issue 1 — auto-save opt-in (`store/settings.ts`)

- `DEFAULTS.saveToGallery` flipped `true → false`. Now both gallery-save
  toggles default OFF; applying a wallpaper never copies it to the gallery
  unless the user opts in. The manual menu action is unaffected.
- **One-time migration** for existing installs: the persisted settings blob is
  written wholesale whenever any setting changes, so a device may already have
  `saveToGallery: true` stored — flipping the default alone wouldn't fix it.
  Added a separate schema-version key (`@kawaii/settings/schema`, version 2)
  and `applyMigrations()`. On `hydrate`, v1→v2 resets an inherited-ON
  `saveToGallery` to OFF exactly once, then re-persists the corrected blob (so
  the next launch doesn't re-read the stale value and skip the now-bumped
  migration). A user who genuinely wants it can re-enable it; the migration
  won't run again. PERSIST_KEY is untouched, so theme/other toggles are kept.

### Issue 2 — lock photos on curated packs (`app/shuffle/[id].tsx`)

- New `isBuiltinPack = !!collection.seedPackId` flag + `builtinPhotos` list
  (resolved via `getPhotoById`).
- The Photos card is now a ternary on `isBuiltinPack`:
  - **Built-in pack:** read-only grid of the pack's fixed photos, header
    "Curated pack — photos are fixed", a lock-icon count chip. No Gallery /
    Internet source buttons, no in-app catalog grid, no Clear, no
    selection/toggle behaviour.
  - **User collection:** unchanged — full editable picker.
- Per the owner's choice, **only the photos are locked** — the pack name, the
  shuffle mode, and the timer/interval all stay editable on curated packs.

## Files changed

- `store/settings.ts` — `saveToGallery` default `true → false`; added
  `SCHEMA_KEY` / `SCHEMA_VERSION` / `applyMigrations()`; `hydrate` runs the
  migration and re-persists when it changes a value.
- `app/shuffle/[id].tsx` — `isBuiltinPack` + `builtinPhotos`; Photos card split
  into read-only (pack) vs editable (user collection) branches.

## Verification

- `npx tsc --noEmit` — no type errors in either changed file.
- Manual (after a release build):
  - Fresh-ish state: set a wallpaper with both toggles off → no new gallery
    image. Turn on "Save to Gallery" → setting a wallpaper saves a copy.
  - Existing install that had it on: first launch after update resets it OFF
    (migration); the toggle still works thereafter.
  - Theme Packs → open a curated pack's editor (gear / long-press) → Photos
    show as a fixed grid with no picker; timer + mode still changeable.
  - "Create your own collection" → full photo picker still present.

## Notes

- JS-only change — no native deps touched. Still needs a release-APK rebuild
  (`npx expo run:android --variant release --no-bundler`) since the owner runs
  the JS-embedded release build, not Metro.
- The manual "Save to Gallery" / "Save to Featured Folder" actions in
  `components/WallpaperMenu.tsx` are intentionally independent of the setting
  and keep working regardless.
- The mood-pool editor (`app/mood/pool/[id].tsx`) already enforced the same
  curated-vs-user rule; this brings the shuffle editor in line.
