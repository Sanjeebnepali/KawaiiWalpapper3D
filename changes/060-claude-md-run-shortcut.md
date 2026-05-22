# `run` shortcut in CLAUDE.md → install release APK, not Metro

**Date:** 2026-05-19
**Type:** docs

## Problem

User: "did you istall apk not expo on phone add this line in claude.md
so when i type run in the last then it will auto start downloding apk
file for my app not expo one only when i type run."

Two asks:
1. Confirm whether the previous build installed the release APK or
   the Expo dev client (it was the release APK — `app-release.apk`
   from `npx expo run:android --variant release --no-bundler`).
2. Codify the convention: when the user ends a message with the word
   `run`, Claude should auto-execute the release-APK build/install
   path, not start a Metro dev server.

The CLI's tail line `› Opening kawaii://expo-development-client/…`
was confusing — it's a cosmetic deep-link attempt that has no
bearing on which variant got installed. The actual APK on the
device is always the release one from this command.

## Solution

Added two sections to `CLAUDE.md`:

1. A new bash code-block entry under `## Commands` documenting the
   release-APK command:
   ```bash
   npx expo run:android --variant release --no-bundler
   ```
2. A new `## "run" shortcut` section immediately below. Spells out
   the trigger ("user ends a message with the word `run`,
   case-insensitive, as a standalone word at the end"), the exact
   command Claude should execute
   (`npm install --legacy-peer-deps && npx expo run:android
   --variant release --no-bundler`), the behavioural notes (run in
   background, the cosmetic deep-link line is not the dev client,
   check `adb devices` first), and an explicit "do NOT default to
   `npx expo start`" so a future session can't misread the
   shortcut as a Metro start.

## Files changed

- `CLAUDE.md` — two new sections.
- `changes/README.md` — index row (added separately).

## Verification

Open `CLAUDE.md` and confirm:

- `## Commands` block now lists the release-APK command alongside
  the existing dev-server and full-rebuild commands.
- The new `## "run" shortcut — install release APK, NOT Expo dev
  client` section is present immediately below `## Commands`.

To test the shortcut itself, in a future Claude Code session send a
message that ends with `run` and confirm Claude executes the
release-APK build instead of starting Metro.

## Notes

- Kept the existing dev-server-first ordering in `## Commands` so
  Claude sessions that need Metro (e.g. for HMR during a JS-only
  feature implementation) still see that path first. The release
  command sits at the bottom of the block where it's the most
  user-facing "give me an APK on my phone" path.
- The shortcut is documented as a CASE-INSENSITIVE STANDALONE WORD
  AT THE END to avoid accidentally triggering it on messages like
  "let me run the tests" or "before we run anything." If users
  report false positives in either direction, refine the trigger
  match here.
