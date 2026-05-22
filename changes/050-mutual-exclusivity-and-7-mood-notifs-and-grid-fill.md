# Mutual exclusivity + 7-mood notifications + grid window-width fit + 15 min bg cadence

**Date:** 2026-05-18
**Type:** fix

## Problem

Four follow-ups the user raised after seeing the previous APK:

1. **Mood-based and Theme-based were running together.** Both drive the
   same wallpaper, so when the user enabled Mood while Shuffle was on
   (or vice-versa), the two features fought over which photo got
   applied on each bg tick. User's request: when one is active, the
   other auto-stops; "only the user-selected feature runs."
2. **Friend Check-in notification only offered 5 moods.** User wanted
   all of the system's mood catalog (7 total) so they can pick any
   mood from the notification shade without opening the app.
3. **Home page "Popular Collections" 2-col grid didn't fill the
   window.** One side fit the screen edge, the other had visible empty
   space — `Math.floor(...)` rounding in the explicit pixel-width
   calculation left 1–2 px of slack on the right that the user
   perceived as a wrong layout.
4. **Background cadence was conservatively 30 min.** User on a 5-min
   shuffle interval saw rotations way slower than the timer suggests.

## Solution

### 1. Mutual exclusivity in the bootstrap subscribers

`lib/moodBootstrap.ts` — both store subscribers learned the
mutual-exclusivity rule:

- **Mood `backgroundEnabled` turns on** → if a shuffle is active, call
  `useShuffleStore.setActive(null)` to deactivate it.
- **A shuffle activates (`activeCollectionId` flips non-null)** → if
  mood `backgroundEnabled` is on, call
  `setBackgroundEnabled(false)`.

Sleep/Wake is intentionally NOT swept up in this — it's an
event-driven notification system (fires at fixed times), not a
continuous wallpaper driver, so it can coexist with either Mood
background or Shuffle without conflict.

UI surfacing of the auto-stop:

- `app/(tabs)/mood.tsx onToggleBackground` — reads
  `useShuffleStore.activeCollectionId` BEFORE flipping the toggle,
  toasts `"✓ Background mood on · Theme shuffle paused"` when applicable.
- `app/shuffle/[id].tsx toggleActive` — reads
  `useMoodStore.backgroundEnabled` before activation, toasts
  `"▶ Shuffle on · Background mood paused"`.
- `app/wallpapers/theme-packs.tsx onShufflePack` — same pattern around
  the built-in pack quick-shuffle button.

### 2. Seven-mood notification action set

`constants/moods.ts` — added `NOTIFICATION_MOOD_IDS` alongside the
existing `MANUAL_MOOD_IDS`. The two arrays serve different surfaces:

```ts
// On-screen 5-button row on Mood Home (keeps emoji + label readable).
export const MANUAL_MOOD_IDS: MoodId[] = [
  'happy', 'sad', 'angry', 'calm', 'excited',
];

// All 7 actions on notifications — happy/sad/angry/calm/excited/surprised/neutral.
export const NOTIFICATION_MOOD_IDS: MoodId[] = [
  'happy', 'sad', 'angry', 'calm', 'excited', 'surprised', 'neutral',
];
```

`lib/moodNotifications.ts maybeRegister` now iterates
`NOTIFICATION_MOOD_IDS` when registering the
`kawaii.mood.prompt` category, so the Daily Prompt + Friend Check-in
notifications carry all 7 action buttons. Android shows the first
2–3 collapsed and the rest after expand — that's a system shade UX
constraint, not something we can override.

The on-screen mood row on Mood Home stays at 5 because 7 buttons
crammed into a single phone-width row would shrink each cell below
the emoji's natural font size and clip the labels.

### 3. CollectionGrid — flex layout, no floor-rounding

`components/CollectionGrid.tsx` was computing
`itemW = Math.floor((width - SIDE*2 - GAP) / 2)` and applying it as an
explicit pixel width to each card. Two costs:

- `Math.floor` truncates the (frequently non-integer) result, leaving
  up to `COLS - 1` (so 1 px here) of horizontal slack — visible as
  empty space on the right edge on some device widths.
- The row-end-alignment behaviour of `numColumns + columnWrapperStyle`
  pushed all that slack to the right, never the left, so the grid
  looked lopsided.

New layout:
- Each card uses `flex: 1` + `aspectRatio: 0.8` (CARD_ASPECT — same
  visual proportion as before).
- `columnWrapperStyle: { gap: GAP }` for the column spacing.
- `ItemSeparatorComponent` (from the previous pass) handles row
  spacing.
- No more `useWindowDimensions` math in this component — RN's layout
  engine derives the half-width from the actual available row width,
  which is always exact, on every device, every orientation.

### 4. Bg-task cadence: 30 min → 15 min

`lib/moodBackgroundTask.ts registerMoodBackgroundTask` default
`minimumIntervalSec` dropped from `60 * 30` to `60 * 15`. 15 min is
Android WorkManager's hard floor — anything below is silently rounded
up by the OS. iOS treats it as a hint anyway. Tells the OS "run as
soon as you'll let us"; the OS still has final say under Doze /
battery saver.

## Files changed

**Modified:**
- `constants/moods.ts` — `NOTIFICATION_MOOD_IDS` new export.
- `lib/moodNotifications.ts` — registers 7-action `kawaii.mood.prompt`
  category from the new constant.
- `lib/moodBootstrap.ts` — mutual-exclusivity guards inside both store
  subscribers.
- `lib/moodBackgroundTask.ts` — `minimumIntervalSec` default 30→15 min.
- `app/(tabs)/mood.tsx` — `useShuffleStore` import; on-toggle toast
  surfaces the auto-pause of an active shuffle.
- `app/shuffle/[id].tsx` — `useMoodStore` import; `toggleActive` toast
  surfaces the auto-pause of background mood.
- `app/wallpapers/theme-packs.tsx` — `useMoodStore` import;
  `onShufflePack` toast surfaces the auto-pause of background mood.
- `components/CollectionGrid.tsx` — flex+aspectRatio layout replaces
  pixel-math layout; cards always fill the row exactly.

## Verification

1. `npx expo run:android --variant release` — JS-only changes, no
   native rebuild needed (existing native modules unchanged).
2. **Mutual exclusivity (Mood ⇨ Shuffle off):** Theme Packs hub →
   "Shuffle" a built-in pack → wallpaper applies. Go to Mood tab →
   toggle Background mood on. Toast reads `"Background mood on · Theme
   shuffle paused"`. Re-open the active shuffle screen — it shows
   "no active collection". Reverse: re-activate the shuffle → toast
   reads `"Shuffling … · Background mood paused"`; Mood tab shows
   Background toggle off.
3. **Sleep/Wake unaffected:** with SW on AND Mood-bg on, toggle
   Shuffle on → SW notifications still scheduled (Mood-bg flips off,
   SW stays on). Both run independently.
4. **Notification: 7 moods.** Fire a daily prompt (any active prompt
   will do — set Daily Prompt's hour to one minute from now via the
   editor). When it lands in the system shade, expand it — all 7
   action buttons appear: Happy / Sad / Angry / Calm / Excited /
   Surprised / Neutral. Tap any one — wallpaper changes to a photo
   from the active mood pool whose bucket matches that mood.
5. **Grid window-width:** Home → scroll to Popular Collections. Both
   columns of cards now reach the SIDE padding on both left AND right
   edges. No empty gutter on the right. Rotate the device — same
   alignment with the new wider/narrower window.
6. **Faster bg cadence:** Theme Packs hub → "Shuffle" → set timer to
   5 min in the editor. Background the app. The OS may still delay
   the first dispatch by 10–15 min on Doze-aggressive devices, but
   subsequent ticks now run on a 15-min OS floor instead of 30.

## Notes

- **Mutual exclusivity ONLY applies to Mood-bg and Shuffle.** Mood
  Mode (camera) is disabled in this build (changes/039), so there's
  no third driver to coordinate. If that comes back, the same
  subscriber pattern extends to it.
- **Sleep/Wake runs alongside either.** It only fires twice a day at
  fixed hours; co-existence won't cause runaway wallpaper changes.
  The bg-task's per-day stamps prevent SW from re-firing mid-day, so
  the rest of the day belongs to whichever continuous driver is on.
- **7-mood notification expand UX is Android's call.** We can't force
  all 7 to show collapsed — the system shade caps that at the top
  N decided by the OEM. Expanding the notification (tap the chevron
  or swipe down on it) reveals the rest.
- **Free-tier check still applies.** Activating a shuffle that
  exceeds the per-purpose collection cap still trips the Premium
  gate before activation; the mutual-exclusivity logic only runs
  AFTER successful activation.
- **15-min cadence is the absolute floor on Android, not a
  guarantee.** Doze mode (phone unused for ~1 h with screen off)
  extends bg-fetch intervals to several hours regardless of what we
  ask. The only way to truly run "continuously" is a foreground
  service with a persistent notification, which is reserved for a
  future opt-in setting.
