# AI tab: make the page feel flowy + always scrollable

**Date:** 2026-05-19
**Type:** fix (UX)

## Problem

User: *"in the ai generation image page can you make it feels [flow]less,
now it feels stack[ed], i can't able to scroll although it has all fit
in the page but still it will be best for ui to have this kind of
features."*

Two real complaints in one sentence:

1. **The four sections (head / prompt box / quick starts / recent
   generations) read as one stacked block** because they all appear at
   once on mount with no entrance staggering — the screen visually
   "lands" all at once and then sits still.
2. **The ScrollView never scrolls on a tall device** because the
   content fits the viewport, and on Android there's no rubber-band
   bounce to hint at scrollability. Even when the content slightly
   overflows, `bounces`/`overScrollMode` weren't set, so the screen
   feels rigid.

## Solution

`app/(tabs)/ai.tsx`:

1. **Staggered entrance** — wrap each of the four sections in
   `Animated.View entering={FadeInDown.delay(N).springify().damping(18)}`
   from `react-native-reanimated`. Delays cascade 40 → 110 → 170 → 220
   → 290 ms, so the sections flow in instead of slamming together.
   Springify + damping(18) matches the press-feel of `AnimatedButton`
   so it doesn't look out of place against the rest of the app.
2. **Always-scrollable** — enable iOS `alwaysBounceVertical` +
   `bounces` so the page rubber-bands on pull-down even when content
   fits, and Android `overScrollMode="always"` so the edge glow shows
   on top + bottom. The horizontal recent-generations strip gets the
   same treatment (`alwaysBounceHorizontal` + `overScrollMode`).
3. **Genuine scroll room** — added a `tailSpacer` (120 dp) view inside
   the ScrollView plus `paddingBottom: 120 + insets.bottom` on the
   `contentContainerStyle`, so on a tall device the content is
   actually taller than the viewport and the user can scroll up — not
   just bounce. `useSafeAreaInsets()` keeps the bottom clearance
   honest across phones with / without the gesture pill.
4. **Breathing room between sections** — `scroll` gap bumped
   `Spacing.lg → Spacing.xl`. Sections now read as distinct cards
   instead of one stacked column. Cheap `paddingBottom: Spacing.xs`
   on the header for a tiny extra beat.
5. **Smoother flick decel** — `decelerationRate="normal"` on both
   scrollers so an Android flick feels more like iOS (the Android
   default is "fast", which feels grippy on a content-light page).

## Files changed

- `app/(tabs)/ai.tsx` — entrance animations, scroll bounce/glow,
  tail spacer, wider gap, safe-area-aware tail padding.

## Verification

1. Open the AI tab → the head, prompt box, quick starts, and recent
   generations strip animate in one after another (~50 ms apart).
2. Pull down from the top of the AI tab — iOS rubber-bands, Android
   shows the over-scroll glow. The page actually scrolls a bit because
   the tail spacer + bottom padding make the content taller than the
   viewport.
3. Swipe the recent generations strip past its right edge — same
   bounce / glow feedback.
4. Re-enter the AI tab from another route — entrance animations
   re-trigger so the "alive" feel is consistent on every visit.

## Notes

- No new deps — `react-native-reanimated` is already in the project
  and used elsewhere (CustomTabBar, WallpaperMenu rows, etc.).
- `FadeInDown` is a layout-animation entering preset, NOT a worklet
  the user wrote — costs are negligible (one shared-value tween per
  section, 4 total).
- The tail spacer is a flat 120 dp `View`, NOT a min-height trick
  (which can fight with `gap`). It always renders below the last real
  section, regardless of whether the recent strip is visible.
- Did not touch `app/ai/preview.tsx` — that screen already has good
  scrollable structure from change 070.
