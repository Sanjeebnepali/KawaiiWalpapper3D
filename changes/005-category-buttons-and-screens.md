# Medium glass category buttons + per-category preview rows + dedicated category screens

**Date:** 2026-05-14
**Type:** feature

## Problem

The home screen needed:

- The 4 large circular category icons replaced with smaller (~55px), premium-looking glass-morphism buttons.
- Below the buttons, 4 stacked sections (one per category — Popular, Newest, Categories, Premium), each showing exactly 4 square photos in a row plus a `View All >` link.
- Both the category button and `View All` should navigate to a full-screen category page, not a modal.
- The category page should show a multi-column grid of photos with heart-favorite and long-press download actions.
- Slide-from-right transition for the category page; status bar stays light.

## Solution

- Rewrote `CategoryIcons` as 4 medium glass buttons. Each is a 55×55 `<BlurView>` inside an outer `<View>` whose `shadowColor` is the category accent — that gives the "soft glow" while leaving the BlurView's clipped corners clean. `borderColor: '#ffffff20'` per the brief. Press handler routes to `/category/[id]`.
- New `components/CategoryPreviewList.tsx` renders one section per `categoryIcons` entry. Each section: small accent dot + title (tappable → category screen), row of 4 square photos sized via `useWindowDimensions()` so they always fill the screen evenly, then a right-aligned `View All >` link (also routes to category screen). 6px gap between photos.
- New route `app/category/[id].tsx`. Outside the `(tabs)` group, so it renders full-screen with no tab bar. 3-column FlatList grid (`numColumns=3`, `columnWrapperStyle={{ gap: 6 }}`); each cell has a heart toggle (per-screen `Set` state) and `onLongPress` triggers a download `Alert.alert`. Header: round back button + `<Title> Wallpapers` + tiny accent dot.
- Registered the new route in `app/_layout.tsx` with `animation: 'slide_from_right'`. The wallpaper modal route still uses `transparentModal` + `fade`.
- Added `categoryMeta`, `getCategoryPhotos(id, count)`, and `getPhotoById(id)` to `mockData.ts`. The `getPhotoById` helper lets the existing `wallpaper/[id]` route accept either a featured id or a generated category photo id (`<categoryId>-<index>`). Switched the wallpaper screen from `getFeaturedById` to `getPhotoById`.

### Native-stack vs. spring config

The brief asked for "spring animation (tension: 100, friction: 10)" via `react-native-reanimated`. Expo Router's `Stack` is `@react-navigation/native-stack`, which uses platform-native push animators (UIKit on iOS, Activity slide on Android) and does **not** expose tension/friction. `animation: 'slide_from_right'` is the closest matching transition. To get a true Reanimated-driven spring you'd need either:

- swap to `@react-navigation/stack` (JS stack, can take a `TransitionSpec` with `SpringConfig`), or
- build a custom shared-element/screen transition with Reanimated.

Both are larger changes. The current native-stack slide already feels close to a spring on real devices. Revisit if a stricter spec is required.

## Files changed

- `constants/mockData.ts` — added `CategoryId`, narrowed `CategoryIcon.id`, added `categoryMeta`, `getCategoryPhotos`, `getPhotoById`.
- `components/CategoryIcons.tsx` — rewritten as medium glass buttons with router push.
- `components/CategoryPreviewList.tsx` — **new**.
- `app/category/[id].tsx` — **new** (full-screen route, 3-col grid, heart, long-press download alert).
- `app/_layout.tsx` — registered `category/[id]` with `animation: 'slide_from_right'`.
- `app/wallpaper/[id].tsx` — `getFeaturedById` → `getPhotoById` so category photos resolve.
- `app/(tabs)/index.tsx` — added `<CategoryPreviewList />` between `<CategoryIcons />` and the Featured section.

## Verification

After clearing Metro (kill any node holding port 8081, then `npx expo start --clear`):

- Home screen: 4 medium (~55px) buttons with subtle glow per accent color. Below them, 4 stacked sections, each with 4 square photos in a row and a `View All >` link.
- Tapping any of the 4 buttons OR a `View All >` link slides a new screen in from the right. The screen shows `<Title> Wallpapers` with a back arrow, plus a 3-column grid of 30 photos. Tapping a heart toggles its state (lavender outline → pink solid). Long-pressing a cell shows the Save/Download alert.
- Tapping a photo in the home preview row OR the category grid opens the wallpaper preview overlay. The image loads under the existing blur-on-load effect.
- Status bar stays light throughout (set in root layout, re-asserted in home `useEffect`, and `<StatusBar style="light" />` placed in the category screen too).

## Notes

- Category page uses a `Set<string>` in local state for favorites — wipes on unmount. Promote to a context or persistence layer when real favorites are needed.
- Long-press currently triggers `Alert.alert` as a placeholder. Wire to actual gallery save (`expo-media-library` + `expo-file-system`) when ready.
- "Categories" as a category name is awkward (it's also the broader concept). Kept per the brief; consider renaming to something like "Curated" or "Collections" if it confuses users.
- `getPhotoById` derives photo metadata (title, accent) from the id pattern — no per-photo storage needed, which keeps `mockData.ts` small. If real photos get unique titles, change to a lookup.
