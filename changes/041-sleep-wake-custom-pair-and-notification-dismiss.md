# Sleep/Wake custom-pair picker + auto-dismiss notification after action

**Date:** 2026-05-17
**Type:** feature + UX fix

## Problem

Two user reports on the changes/040 build:

1. *"i don't able to select two images i only able to select one image."*
   The 040 Sleep/Wake card only let the user pick ONE of the 6 curated
   packs. The user wants to pick two arbitrary photos themselves — one
   for the wake transition, one for the sleep transition.

2. *"when i select any option from notification it need to be vanished from
   notification bar after finish it's work to ask like friend."* When the
   user taps an emoji on a Friend Check-in / Daily Prompt / Sleep-Wake
   notification, the notification stays in the system shade. Should
   disappear immediately after we've applied the wallpaper — like a friend
   who asks a question once, gets the answer, and goes away.

## Solution

### Custom pair selection

Added `CUSTOM_SLEEP_WAKE_ID = 'custom'` sentinel pack id. When the active
pack is this sentinel, the engine + notification handler read the two
user-picked photo IDs out of the mood store and resolve them via the
existing `getPhotoById` (since they're regular catalog IDs).

**Two new store fields** + persistence + setters:
- `sleepWakeCustomWakeId: string | null`
- `sleepWakeCustomSleepId: string | null`
- AsyncStorage keys: `@kawaii/mood/swCustomWake@v1`, `@kawaii/mood/swCustomSleep@v1`
- Actions: `setSleepWakeCustomWakeId(id)`, `setSleepWakeCustomSleepId(id)`
- Bootstrap re-schedules notifications when either custom ID changes.

**Updated `applySleepWakePhoto(packId, kind)`** in `lib/moodEngineActions.ts`:
when `packId === CUSTOM_SLEEP_WAKE_ID`, looks up `sleepWakeCustomWakeId`
(or `…SleepId`) from the store, resolves via `getPhotoById`, and routes
through the existing `setAsWallpaper` pipeline. Returns "Custom X image
not picked yet" if the slot is empty (defensive — UI prevents this).

**New picker UI** (`app/(tabs)/mood.tsx`):
- Pack-picker bottom-sheet now shows a **"Custom pair"** entry at the
  top with a dashed cyan border + `+` icon. Tapping it dismisses the
  pack picker and opens a second bottom-sheet…
- **Custom-pair bottom-sheet** at 88% snap, cyan accent:
  - Two **slots** at the top: "☀️ Wake" and "🌙 Sleep". Each shows the
    assigned image (4:3 thumb) or a placeholder with `+` icon.
  - **Photo grid** (3 columns, ~42 photos sourced from `getMoodPhotos`
    across all 7 moods — variety without overwhelming).
  - **Tap behaviour** (three-state machine):
    - No slots filled → tap fills Wake
    - Wake filled only → tap fills Sleep
    - Both filled → tap replaces Sleep (most recent slot)
    - Tap an already-selected photo → clears that slot
  - Selected photos get a colored badge (gold ☀️ for wake, lavender 🌙 for sleep) + 3px tint border
  - **Save button** activates only when both slots are filled. On save:
    sets `sleepWakePackId = 'custom'`, dismisses, toasts.

The main SW card on Mood Home now correctly displays the custom pair —
the dual-thumb component shows the user's two picked photos when in
custom mode (was previously hardcoded to read from `activeSleepWakePack`,
which is null for custom).

### Auto-dismiss notification after action

`lib/moodNotifications.ts`:

- Added `dismissNotificationAsync?: (id: string) => Promise<void>` to the
  `NotificationsLike` type.
- `NotificationResponseLike` now exposes
  `notification.request.identifier` — the OS-assigned ID of the
  *displayed* notification (different from the schedule ID).
- `handleResponse` now defines a local `dismissNow()` helper at the top
  that pulls the notification from the shade via
  `dismissNotificationAsync(displayedId)`. Called at the end of both
  branches (Sleep/Wake AND mood-prompt) so any notification action
  removes the banner.

The schedule is unaffected — the next day's wake/sleep notification (or
next interval of the Friend Check-in) still fires normally. We only
dismiss the *displayed* instance.

## Files changed

- `lib/moodHistory.ts` — 2 new AsyncStorage keys + 2 new in-memory
  fallbacks + 2 new save helpers + `LoadedMoodMode` type extension +
  `memSnapshot` extension
- `store/mood.ts` — 2 new state fields + 2 new setters + hydrate
  extension
- `constants/sleepWakePacks.ts` — `CUSTOM_SLEEP_WAKE_ID` constant +
  `getSleepWakePack` early-returns null for the custom sentinel (callers
  read pack info from the store instead)
- `lib/moodEngineActions.ts` — `applySleepWakePhoto` custom-pack branch
  (resolves via `getPhotoById`, returns the helpful error if a slot is
  unpicked)
- `lib/moodBootstrap.ts` — on-boot scheduler + store subscriber both
  understand custom mode and only schedule when both custom slots are
  filled; cancels notifications if pack is 'custom' but slots are empty
- `lib/moodNotifications.ts` — `dismissNotificationAsync` type, response
  shape gains `identifier`, `dismissNow()` helper, both branches call it
- `app/(tabs)/mood.tsx` — main SW card detects custom mode and renders
  user's pair, "Custom pair" entry at the top of the pack-picker, full
  custom-pair bottom-sheet with two slots + photo grid + three-state
  tap machine + save button + `CustomSlot` inline component; ~10 new
  `swStyles` for slots / grid / save button
- `changes/041-…md` + index row

## Verification

1. `npx expo run:android --variant release`.
2. **Custom pair flow:**
   - Mood tab → Sleep/Wake card → tap pack row.
   - First option: **"Custom pair"** with dashed cyan border. Tap it.
   - Custom picker opens. Two slots at top (both placeholder), photo
     grid below.
   - Tap a photo → ☀️ Wake slot fills + photo gets gold badge.
   - Tap another photo → 🌙 Sleep slot fills + photo gets lavender badge.
   - Tap the wake photo again → wake slot clears.
   - Tap the sleep photo again → sleep slot clears.
   - With both filled → "Save custom pair" button activates (cyan).
   - Tap Save → sheet dismisses, toast "✓ Custom pair saved".
   - Main SW card now shows "Your custom pair" with the two custom
     images in the dual-thumb.
3. **Notification dismiss flow:**
   - Friend Check-in: set to 15 min, wait for notification.
   - Tap any emoji on the notification.
   - The notification should vanish from the shade immediately.
   - (Open the app — "Currently applied" + history reflect the new
     mood as before.)
   - Same for Daily Prompt and Sleep/Wake notifications.

## Notes

- **Custom photos use the mock catalog.** Source pool is
  `getMoodPhotos(moodId, 6)` × 7 moods = 42 photos. These IDs (e.g.
  `mood-happy-3`) resolve via the generic-fallback branch in
  `getPhotoById` so they work end-to-end. To let the user pick from
  their saved favorites or downloaded images instead, swap the
  `customPhotoPool` source — UI + handler are unchanged.
- **Tap state machine is intentionally simple.** A 3-state cycle
  (empty → wake → sleep → tap-to-replace-sleep) is easier to discover
  than a long-press menu or per-slot "select for wake" / "select for
  sleep" buttons. Users figure it out in 2 taps.
- **`dismissNotificationAsync` is a no-op fallback** if the
  expo-notifications version doesn't export it (very old SDKs). The
  notification just stays in the shade — same as before this change.
- **The schedule survives the dismiss** — we use
  `dismissNotificationAsync` (clears the DISPLAYED instance) not
  `cancelScheduledNotificationAsync` (which would prevent future fires).
- **All four notification types** (Daily Prompt, Friend Check-in, Sleep
  notification, Wake notification) get the same dismiss behaviour
  because they all route through the same `handleResponse`.
