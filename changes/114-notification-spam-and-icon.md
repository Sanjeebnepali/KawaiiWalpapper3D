# Notification pile-up + default notification icon

**Date:** 2026-05-24
**Type:** fix

## Problem
A screenshot of the notification shade showed two issues:
1. **Pile-up:** the recurring mood check-in stacked many notifications (one per interval) instead of replacing the previous one.
2. **Default icon:** every notification used Android's generic robot glyph, not a brand icon.

## Root cause (evidence)
1. The Android-primary check-in path is the native foreground service: its `onTick` (`lib/moodBootstrap.ts:134`) calls `fireMoodPromptNotification` every interval. That function (`lib/moodNotifications.ts`) called `scheduleNotificationAsync` with **no `identifier`** (so expo-notifications auto-generated a *unique* id per fire) → Android treats each as a distinct notification and stacks them. (The random-opener variants in the screenshot are stale fires from the iOS/no-FGS JS chain, which the Android FGS path already cancels via `cancelFriendCheckInNotification`.)
2. The `expo-notifications` plugin set `icon: "./assets/icon.png"`, but **that file does not exist** in the repo, so Android fell back to its default small-icon glyph.

## Solution
1. **Stable identifier (Problem 1):** added `MOOD_PROMPT_NOW_ID = 'kawaii.mood.prompt.now.v1'` and pass it as the `identifier` on the immediate prompt in `fireMoodPromptNotification`. Reusing one id means each new prompt **replaces** the previous one in the shade — at most one "how are you feeling?" prompt at a time, no matter the interval. This is the same mechanism the daily / sleep-wake / ≥15-min friend notifications already rely on (they each use a fixed id). No change to those paths, to the JS chain, or to tap-handling (the response handler already dismisses by the delivered notification's identifier).
2. **Real notification icon (Problem 2):** generated `assets/notification-icon.png` — a white heart silhouette on transparent (Android status-bar icons use only the alpha channel and are tinted with the configured `color: #fab3ca`). Pointed the `expo-notifications` plugin `icon` at it. Used a dedicated filename (not `icon.png`) so nothing else is affected.

## Files changed
- `lib/moodNotifications.ts` — `MOOD_PROMPT_NOW_ID` const + `identifier` on the immediate prompt.
- `assets/notification-icon.png` — new white-heart monochrome notification icon.
- `app.json` — `expo-notifications` plugin `icon` → `./assets/notification-icon.png`.

## Verification
- `npx tsc --noEmit` — clean (only the 5 pre-existing unrelated errors).
- Generated icon visually verified as a clean heart silhouette (composited on a dark background).
- **Requires a native rebuild** — the notification icon is baked at build time, and the plugin change is native config. After install, the recurring check-in should show a single, self-replacing prompt with the heart icon instead of a growing stack of robot-glyph notifications.

## Notes
- The earlier "auto-remove after 2 minutes" idea is now largely moot for the recurring prompt: with one self-replacing notification there's nothing to pile up. If a timed auto-dismiss is still wanted later, it needs Android's native `setTimeoutAfter` (not exposed by expo-notifications) — a separate native change.
- The sub-15-min iOS/no-FGS JS chain still uses distinct identifiers by design (it must pre-queue future one-shots); it is not the Android path and is cancelled when the FGS is available, so it's left unchanged here.
