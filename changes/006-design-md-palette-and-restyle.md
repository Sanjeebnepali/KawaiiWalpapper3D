# Apply DESIGN.md palette + restyle category icons, tab bar, profile, category grid

**Date:** 2026-05-14
**Type:** feature

## Problem

Brief asked for a palette swap and several visual rework items to match a design spec ("DESIGN.md"). Notable asks:

- Background `#131313`, surface `#1E1E1E`, border/divider `#333333`, text `#e5e2e1` / `#B0B0B0`.
- Primary accent `#fab3ca` (soft pink) used for **all active states** (top tab underline, bottom tab active, glow ring, primary CTAs).
- Secondary accent `#dcb8ff` (soft purple) replaces the previous `#B388FF` lavender.
- Category icons (Popular / Newest / Categories / Premium) at 56×56, radius 16, solid `#1E1E1E` with `#333333` border, active state = pink border + glow.
- Bottom tab bar with `My Zedge` renamed to **Profile**; bar uses solid `#131313` + top border `#333333` (no blur).
- Profile screen with dark mode toggle alongside favorites / downloads / generations / settings.
- 4-photo preview rows on home use 16px radius and 8px gap.
- Category screen grid bumped up — brief lists 48% (2-col) or 32% (3-col) as valid; switched to 2-col 1:1 squares for the "medium" feel.

## Solution

### Palette swap (theme.ts)

Single source of truth — updating `Colors` in `constants/theme.ts` cascades everywhere:

| Token | Old | New |
|---|---|---|
| `bg` | `#0D0D0D` | `#131313` |
| `surface` | `#1A1A1A` | `#1E1E1E` |
| `border` | `rgba(255,255,255,0.08)` | `#333333` |
| `text` | `#FFFFFF` | `#e5e2e1` |
| `textDim` | `#B3B3B3` | `#B0B0B0` |
| `pink` | `#FFB6C1` | `#fab3ca` |
| `lavender` | `#B388FF` | `#dcb8ff` |
| `pinkDim` | rgba pink 0.18 | rgba `#fab3ca` 0.18 |
| `lavenderDim` | rgba lavender 0.18 | rgba `#dcb8ff` 0.18 |
| `glassFill` | `rgba(20,20,28,0.55)` | `rgba(30,30,30,0.6)` |
| `glassStroke` | `rgba(255,255,255,0.14)` | `#333333` |

Comments now annotate `pink` as **primary** and `lavender` as secondary so the intent is obvious for future edits.

### Hardcoded literal sweep

`#0D0D0D` was used in ~9 places as "dark text/icon on a light element" (logo glyph, badge text, generate button text, apply button, etc.). Updated all to `#131313` so they keep matching the new bg. Also bumped `app.json`'s adaptive icon background from `#0D0D0D` to `#131313`.

### Active-state lavender → pink swaps

Anything that signals "this is the active/primary action" was switched from `Colors.lavender` to `Colors.pink`:

- `components/TopTabs.tsx` — active underline + shadow
- `app/(tabs)/_layout.tsx` — `tabBarActiveTintColor`, glow ring background + border, shadow
- `app/_layout.tsx` — react-navigation `NavTheme.primary`
- `app/(tabs)/ai.tsx` — Generate button bg + shadow
- `app/(tabs)/profile.tsx` — avatar bg + shadow
- `app/wallpaper/[id].tsx` — loading spinner color
- `components/Header.tsx` — search cursor color + logo shadow

Kept lavender for decorative per-card accents in `mockData.ts` (Categories, Grumpy Baby, Rainy theme, etc.) — those are color-coding, not active states.

### Category icons (`components/CategoryIcons.tsx`)

Rewritten:

- 56×56 (was 55), radius 16 (`Radius.lg`).
- Replaced `<BlurView>` with a plain `<View>`: `backgroundColor: Colors.surface` (`#1E1E1E`), `borderColor: Colors.border` (`#333333`), `borderWidth: 1`. The previous BlurView+#ffffff20 border looked nice but the brief specifically asked for solid surface — and the categorical "outline" style reads cleaner.
- Added `useState<CategoryId | null>` for active state. On tap: set active → push to `/category/[id]`. Active border becomes `Colors.pink` with a pink shadow (the "subtle glow"); active icon and label color also pink.
- Outer row uses `flex: 1` per cell with explicit `gap: 8` and outer `paddingHorizontal: Spacing.lg`, so each cell width is `(screenW - 32 - 24) / 4` — auto-aligned via flex without manual width math.

### Bottom tab bar (`app/(tabs)/_layout.tsx`)

- Removed `<BlurView>` background entirely. Bar is now solid `Colors.bg` (`#131313`) with `borderTopWidth: 1, borderTopColor: Colors.border`. Brief was explicit about the solid background, so no compromise blur.
- `Profile` label (route file unchanged at `app/(tabs)/profile.tsx`; just the display label changed).
- `tabBarActiveTintColor: Colors.pink`. Glow ring uses `Colors.pinkDim` for fill and a pink shadow.
- Safe-area math unchanged: `height = 60 + max(insets.bottom, 8)`, `paddingBottom = max(insets.bottom, 8)` — sits clear of iOS home indicator and Android nav buttons.

### Profile screen (`app/(tabs)/profile.tsx`)

- Wrapped in a `ScrollView` (was a static `View`) so it doesn't cut off on small screens.
- Added a "Preferences" section with a dark mode `<Switch>` (track: pink when on, border when off; thumb: text/textDim). State is local — promote to context if a real light theme gets implemented.
- Renamed "Settings" row to "Account Settings" per brief.
- Avatar bg switched from lavender to pink (primary brand color).

### Category screen (`app/category/[id].tsx`)

- 3-col → 2-col grid, gap 6 → 8, radius `md` → `lg`, cell aspect 1.4 → 1:1 (square per brief).

### Card preview rows (`components/CategoryPreviewList.tsx`)

- `GAP: 6 → 8`, cell radius `md (12) → lg (16)`. Cells are still 4-per-row (brief explicitly says 4 in a row), so width = `(screenW - 32 - 24) / 4` — slightly wider than before because of the bigger gap calc adjustment.

### Header search (`components/Header.tsx`)

Border radius `Radius.xl (20)` → literal `24` per brief. Didn't promote to a token because no other place uses 24px.

## Files changed

- `constants/theme.ts` — palette swap (primary intent of this change)
- `app.json` — adaptive icon bg `#0D0D0D` → `#131313`
- `components/CategoryIcons.tsx` — solid bg, #333 border, active state, 56px
- `components/CategoryPreviewList.tsx` — gap 8, radius lg
- `components/Header.tsx` — `#0D0D0D` literals → `#131313`, cursor + shadow lavender → pink, search radius 24
- `components/TopTabs.tsx` — active underline lavender → pink
- `components/CollectionGrid.tsx` — `#0D0D0D` → `#131313`
- `app/_layout.tsx` — NavTheme primary lavender → pink
- `app/(tabs)/_layout.tsx` — solid bg + top border (no blur), `Profile` label, pink active
- `app/(tabs)/profile.tsx` — full rewrite: ScrollView, dark mode toggle, pink avatar, palette literals updated
- `app/(tabs)/ai.tsx` — Generate button lavender → pink, `#0D0D0D` → `#131313`
- `app/wallpaper/[id].tsx` — `#0D0D0D` literals → `#131313`, loader spinner pink
- `app/category/[id].tsx` — 3→2 col, square cells, radius lg

## Verification

After Metro restart with `--clear`:

- Whole app shifts to slightly warmer dark (`#131313` reads warmer than the old jet `#0D0D0D`). Surfaces are visibly lighter (`#1E1E1E` vs old `#1A1A1A`).
- Top tab underline (Wallpapers/Video/Dual/Theme Packs) glows pink.
- Bottom tab active state: pink icon + pink label + pink glow ring. Bar is solid dark with a thin border on top — no blur.
- Bottom tabs: Wallpapers / AI Generator / **Profile** (was "My Zedge").
- Category buttons row: 4 rounded squares, each 56×56. The just-tapped one persists with a pink border + glow until you tap a different one.
- Tap a category → slide-from-right transition into the category screen → 2-column grid of square thumbnails (each ~48% width).
- Profile tab: scrollable, has favorites/downloads/my-generations/account-settings rows, plus a "Preferences" section with a dark-mode toggle switch (pink when on).

## Notes

- **`DESIGN.md` does not exist in the repo.** Brief said "from the DESIGN.md file provided" but nothing was attached. Worked entirely from the inline color values listed in the brief; please add `DESIGN.md` to the repo if you want it as a durable spec for future changes.
- Brief said "Inactive Tabs/Buttons: Use `#333333` (divider) with white text." Interpreted as: generic inactive surfaces use `#333333` as the *border*, not background — the solid surface stays `#1E1E1E` to match the rest of the UI. The bottom tab bar inactive icon color uses `#B0B0B0` (textDim), not pure white, because the screenshot intent was the muted look.
- Cards on the home preview rows are still 4-per-row per the explicit "4 medium cards in a row" line in section 5. The 48%/32% sizing in section 2 was applied to the **dedicated category screen** instead, which made more visual sense than overriding the explicit "4 in a row" requirement.
- Category screen now uses 1:1 squares per the brief. Wallpaper apps usually use portrait (4:5 or 9:16) thumbnails — if 1:1 looks wrong on real photos, switching `cellH` back to `cellW * 1.4` (or `cellW * 16 / 9`) is a one-line change in `app/category/[id].tsx`.
- The dark-mode toggle on Profile is currently a no-op (just toggles local state) — there's no light theme yet. Wire to a `ThemeProvider` context if you want it functional.
