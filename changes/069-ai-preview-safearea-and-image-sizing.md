# AI preview: safe-area inset + tighter image sizing

**Date:** 2026-05-19
**Type:** fix (UX)

## Problem

User after change 068's working AI generation: "now its good but
the problem is the ui after the image is generate."

Two issues in `app/ai/preview.tsx`:

1. **Action bar clipped by phone nav.** Same bug pattern as the
   mood pool footer (fixed in change 065): the bottom action row
   (Save / Set / To pool / Retry / Discard) was positioned
   absolute with a static `paddingBottom: Spacing.lg`. On Vivo /
   MIUI devices the OS gesture pill / 3-button nav eats ~30 dp
   from the bottom, partially clipping the buttons and making
   the bottom row of action labels hard to read.
2. **Image dominates the viewport.** `imageH = Math.min(height *
   0.72, width * 16/9)` evaluated to ~576 dp on a 360×800 dp
   phone — 72% of screen height. After accounting for header
   (~70 dp) and the action bar (~80 dp with insets), only ~70 dp
   was left for the prompt block in the visible viewport. The
   block ended up either invisible or required scrolling to
   reach, breaking the "see what you generated and what you
   asked for at a glance" UX.

## Solution

`app/ai/preview.tsx`:

### 1. Safe-area inset on the action bar

- Added `useSafeAreaInsets` to the existing
  `react-native-safe-area-context` import alongside `SafeAreaView`.
- Read `insets.bottom` inside the component.
- Action bar now sets `paddingBottom` inline as
  `insets.bottom + Spacing.sm`. Static `paddingBottom: Spacing.lg`
  removed from the StyleSheet entry; a comment forwards readers
  to the inline override so nobody re-adds it.
- ScrollView `contentContainerStyle` also gets the inset inline as
  `insets.bottom + 90 + Spacing.lg`. The `90` is the rough content
  height of the action bar (icon + label + padding); together
  this keeps the prompt block clear of the action bar regardless
  of OS nav height.

### 2. Image height retuned

```ts
// before
const imageH = Math.min(height * 0.72, width * (16 / 9));

// after
const imageH = Math.min(height * 0.55, width * 1.5);
```

- Drop the height-percentage from 72% to 55%. On a 360×800 dp
  phone that's 440 dp instead of 576 — frees ~140 dp for the
  prompt block.
- Switch the width-derived cap from `16/9` (1.78x — too tall) to
  `1.5x` for a 2:3 wallpaper-ratio card. Still tall enough to
  showcase the generation, doesn't dominate the screen.

Now the visible viewport on a typical phone shows: header
(~70 dp) + image (~440 dp) + prompt block (~120 dp) + action bar
(~100 dp w/ insets) = ~730 dp total, fits within the 800 dp
visible height. No scrolling needed for the happy path; tall
prompts still scroll cleanly.

## Files changed

- `app/ai/preview.tsx` — `useSafeAreaInsets` hook + inline
  paddingBottom on action bar + scroll content; static
  paddingBottom removed from both StyleSheet entries; imageH
  formula retuned.
- `changes/README.md` — index row.

## Verification

JS-only — `run` to rebuild.

After install:

1. **AI tab** → generate any prompt → preview opens.
2. **Expected layout** in the visible viewport (no scrolling):
   - Header at top with back button + "AI generation" title
   - Image card filling ~55% of the screen
   - Prompt block below the image showing your prompt
   - 5-button action bar at the bottom, clearing the OS gesture
     pill / nav buttons.
3. All 5 action buttons should be fully tappable — the bottom
   row of labels (Save / Set / To pool / Retry / Discard) should
   sit above the system nav with breathing room.

## Notes

- **Same pattern as change 065's mood pool footer.** Two screens
  now use the inline-inset pattern. If we ship a third
  absolutely-positioned bottom bar, lift the
  `paddingBottom: insets.bottom + N` into a shared helper —
  for now duplicating two lines is cheaper than adding a util
  with a single caller.
- **iOS:** `useSafeAreaInsets` returns the home-indicator height,
  same code handles both platforms.
- **Tall prompts** (over a few sentences) still scroll. The
  `ScrollView` is the outer container; only the action bar is
  fixed. Prompt block at the bottom of the scroll content has
  enough paddingBottom to not be hidden by the action bar.
- **Image aspect compromise.** Generation requests are 9:16
  (768×1344 px) but the preview card displays at 2:3 (1.5x
  width). Image gets letterboxed slightly via `contentFit:
  'cover'` rather than `'contain'`, so you see the full image
  centred — the prompt block balancing the layout is more
  valuable than seeing every pixel-row of the generation. Tap
  "Set as wallpaper" to see the full 9:16 on the lock/home
  screen.
