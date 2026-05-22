# Premium modal redesign: SetAsWallpaper, Info, menu polish

**Date:** 2026-05-15
**Type:** feature

## Problem

The wallpaper-preview action surface still leaned on native `Alert`s for
"Set as Wallpaper" (Lock/Home/Both) and "Wallpaper Info" — fine for a stub,
but not premium. The `WallpaperMenu` itself used a plain `BottomSheetModal`
with no entrance animation per row and no accent treatment.

## Solution

The spec's "Task 5: Fix Image Editor" was deferred again (chosen by user)
because no editor exists yet and the full crop + text + filter build is a
multi-day standalone feature. `moti` was *not* installed — the codebase
already uses reanimated v4 directly (`SmoothToggle`, `TopTabs`,
`PremiumIcon`, `PremiumModal`), and reanimated covers everything the spec
asked moti for. Adding another animation library would be churn for zero
gain.

**Shared `PremiumSheet` wrapper.** New `components/PremiumSheet.tsx` is a
`forwardRef<BottomSheetModal>` that handles backdrop, themed background,
handle, a `LinearGradient` accent strip across the top
(`[accentColor, theme.secondary]`), and consistent title/subtitle spacing.
Bodies use `BottomSheetScrollView` so they always scroll on small phones
without per-sheet boilerplate.

**Reanimated `AnimatedButton`.** New `components/AnimatedButton.tsx` —
Pressable wrapped in an `Animated.View`; press-in / press-out drive a
`useSharedValue` through `withSpring` for a subtle scale (default `0.96`).
No re-renders on press; hit area is unchanged. Used by every premium row
button.

**`SetAsWallpaperModal`.** New `components/SetAsWallpaperModal.tsx`. Premium
replacement for the Lock/Home/Both `Alert`. Compact image preview at top,
three selectable cards (icon + label + radio dot) with staggered FadeInUp
entrance; selected card glows `theme.primary` (border + shadow). Full-width
Apply button is disabled until a target is chosen; tapping dismisses the
sheet and runs the existing `setAsWallpaper` helper. `present()` resets the
selection so each open starts fresh.

**`WallpaperInfoModal`.** New `components/WallpaperInfoModal.tsx`. Compact
thumbnail + accent-colored tag pill + a 5-row metadata table (Tag /
Resolution / Format / Source / ID). Rows fade in with a stagger; a Share
button at the bottom runs the existing `shareWallpaper` helper.

**`WallpaperMenu` polish.** Migrated to `PremiumSheet` (drops the manual
backdrop/bg boilerplate). Each option is now an `AnimatedButton`
(press-scale), wrapped in `Animated.View` with
`FadeInUp.delay(40 + i*28).springify()` for a snappy staggered entrance.
Cancel button added at the bottom. Two new optional props,
`onSetWallpaper` and `onShowInfo`, let the parent delegate those actions to
the new dedicated modals — the menu still works standalone (falls back to
Alerts) if those props are omitted.

**Wallpaper preview chains the modals.** `app/wallpaper/[id].tsx` now owns
refs for all three sheets and threads `onSetWallpaper` / `onShowInfo` into
the menu. Each handler dismisses the menu and presents the next sheet after
a 220 ms delay so the gorhom dismiss animation completes cleanly. The
previously dead "Apply" button on the glass footer now opens
`SetAsWallpaperModal` directly — the "direct apply" fast path: tap Apply →
sheet → pick target → Apply → toast (no Alert in the chain).

**Honest caveat:** programmatically applying a wallpaper to a specific
target without a custom native module + FileProvider isn't possible
cross-platform. The modal flow *feels* direct, but the underlying
`setAsWallpaper` still saves the image and (Android) opens the system
wallpaper picker / (iOS) toasts the Settings › Wallpaper path. No change
from change 012 there.

## Files changed

- `components/PremiumSheet.tsx` — NEW (shared sheet wrapper)
- `components/AnimatedButton.tsx` — NEW (reanimated press-scale)
- `components/SetAsWallpaperModal.tsx` — NEW (premium Lock/Home/Both)
- `components/WallpaperInfoModal.tsx` — NEW (premium info table)
- `components/WallpaperMenu.tsx` — uses PremiumSheet + AnimatedButton + FadeInUp; new onSetWallpaper / onShowInfo callbacks; Cancel button
- `app/wallpaper/[id].tsx` — owns the three sheet refs; wires the chain; bottom Apply button now opens SetAsWallpaperModal directly

## Verification

- `npx tsc --noEmit` passes clean.
- On device (no rebuild needed — pure JS round, all native deps were
  already installed in change 012):
  - Wallpaper preview → ellipsis → menu rows stagger in, each scales on
    press → "Set as Wallpaper" → premium modal with three selectable
    cards → pick one → Apply → toast.
  - Same flow via the glass-footer Apply button (skips the menu).
  - "Wallpaper Info" opens the new modal, not an Alert.
  - Theme change in Settings re-colors every sheet's accent strip + active
    card glow.

## Notes

- The image editor (Feature 2) stays deferred. `expo-image-manipulator` is
  already installed for the editor round.
- `setAsWallpaper`'s OS-picker step is unchanged — the redesign is UI.
- `moti` not added; reanimated v4 is the codebase standard for animations.
