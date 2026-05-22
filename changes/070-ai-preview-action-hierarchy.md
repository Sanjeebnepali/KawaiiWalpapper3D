# AI preview: action hierarchy + breathing room redesign

**Date:** 2026-05-19
**Type:** fix (UX)

## Problem

User after change 069's safe-area fix:

> the ui after image generated fell congusted and tight can you
> make free buttons image all need to be like independent other
> are good

Two related complaints:

1. **Cramped feel.** Five action buttons (Save / Set / To pool /
   Retry / Discard) crammed into a single horizontal row at the
   bottom — each cell got ~70 dp of width on a 360 dp phone, the
   labels were 11 dp font, the icons 20 dp, the touch targets
   borderline tappable. With the action bar absolutely positioned
   it visually overlapped the prompt block too.
2. **No hierarchy.** All five buttons looked identical — same icon
   size, same label weight, same tint. The user couldn't see at a
   glance which was the "primary" thing to do after a generation.

## Solution

Full rebuild of the preview's action section in `app/ai/preview.tsx`.
Three changes:

### 1. Drop the absolutely-positioned action bar

Everything is now part of the ScrollView's flow. The bottom area
no longer floats over the prompt block. ScrollView's
`paddingBottom: insets.bottom + Spacing.xl` is the only positional
concern — buttons sit naturally above the OS nav.

`scroll.gap: Spacing.lg` provides 16 dp between every section
(image → prompt → primary → secondary → tertiary), eliminating
the visual crowding.

### 2. Three-tier button hierarchy

- **Primary — "Set as Wallpaper"** (full-width hero, solid
  `theme.primary` background, 54 dp tall, 15 dp text, weight 900).
  The main reason a user generated an image is to use it as
  wallpaper; this gets the dominant CTA.
- **Secondary — "Save to Gallery" + "Add to pool"** (two outlined
  buttons side by side, 48 dp tall, 13 dp text, weight 800).
  Also-useful actions, distinct from destructive options.
- **Tertiary — "Retry with this prompt" + "Discard"** (text-only
  ghost buttons at the bottom, 12 dp text, no border, no
  background). Navigational / destructive — clearly less
  prominent but still tappable.

Each tier has distinct visual weight so the user's eye lands on
"Set as Wallpaper" first without reading. Retry / Discard sink
into the background unless the user is specifically looking for
them.

### 3. Wider labels

The cramped row forced abbreviations ("Set", "To pool"). The
new layout has space for clearer labels: "Set as Wallpaper",
"Save to Gallery", "Add to pool", "Retry with this prompt",
"Discard". Reads like a normal UI, not an icon toolbar.

### Cleanup

- Removed the now-unused `ActionBtn` helper component.
- Removed `actionBar` / `actionRow` / `actionCell` / `actionLabel`
  styles.
- `promptBlock.marginTop` dropped — the scroll `gap` handles
  spacing.

## Files changed

- `app/ai/preview.tsx` — action section rebuilt, ActionBtn helper
  removed, styles replaced (primaryBtn / secondaryRow /
  secondaryBtn / tertiaryRow / tertiaryBtn / their *Text
  counterparts), promptBlock margin tweaked.
- `changes/README.md` — index row.

## Verification

JS-only — `run` to rebuild.

After install, generate any prompt. The preview screen now flows:

```
[Header back + title]            ↑ chrome
        ↓ Spacing.lg
[Image card, 55% screen height]  ↑ content
        ↓ Spacing.lg
[Prompt card]
        ↓ Spacing.lg
[Set as Wallpaper]      ← solid theme color, hero CTA
        ↓ Spacing.lg
[Save] [Add to pool]    ← outlined pair
        ↓ Spacing.sm + Spacing.lg (tertiaryRow paddingTop)
[Retry] ........ [Discard]  ← text-only, edges of row
        ↓ insets.bottom + Spacing.xl  ← OS nav clearance
```

Tap any of the buttons — they should feel like distinct,
clearly-labelled actions with their own breathing room, not five
crammed icons in a strip.

## Notes

- **Image card unchanged** from change 069 — `Math.min(height *
  0.55, width * 1.5)`. If a user prefers a smaller / bigger
  image card we can adjust.
- **All button busy-state ActivityIndicators preserved.** Same
  per-action `busyAction === '…'` checks; Set spinner appears on
  primary, Save on secondary[0], pool on secondary[1].
- **No safe-area math needed for the absolute-positioned bar
  anymore** — that whole pattern is gone. The bottom inset is
  now just an additive `+ Spacing.xl` in the scroll content's
  paddingBottom, which is cleaner.
- **Hierarchy translates to other paid providers later.** When
  DALL-E lands, this same three-tier layout works — only the
  generation pipeline changes, not the result-handling UX.
