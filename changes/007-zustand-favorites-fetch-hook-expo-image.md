# Zustand favorites store + useFetchWallpapers hook + expo-image migration

**Date:** 2026-05-14
**Type:** feature

## Problem

An architecture brief asked for a specific stack/folder layout. On inspection, the app already had functionally-equivalent architecture (Expo Router *is* `@react-navigation/native` + `react-native-screens`; flat `components/` + `constants/` instead of `/src/...`). After confirming with the user, scope was narrowed to the **genuinely missing pieces only** — no destructive routing migration, no `/src` reshuffle, no Reanimated downgrade:

1. No favorites state management — favorites was local `useState` in the category screen, lost on unmount.
2. No `useFetchWallpapers` hook — screens imported mock data directly with no loading-state seam.
3. `expo-image` was in `package.json` but unused — components rendered RN `Image` / `ImageBackground`.

## Decisions

- **Kept Expo Router.** Migrating to hand-wired `/navigation` files = large destructive refactor, identical runtime, discards changes 003/005/006. Declined.
- **Kept flat folder layout.** Added `store/` and `hooks/` at the root to match the existing `components/` / `constants/` convention rather than introducing `/src`.
- **Kept Reanimated v4.** Brief asked for v3; downgrading re-breaks the worklets 0.7.x ↔ Reanimated 4.2.1 gradle assertion fixed in change 001. v4 covers all animation needs.
- **Favorites via Zustand** (user picked it over Context) — lighter, no provider nesting, easy `persist` middleware later.

## Solution

### Zustand favorites store (`store/favorites.ts`)

`useFavoritesStore` holds `ids: string[]` with `toggle(id)` and `clear()`. Two selector helpers:

- `useIsFavorite(id)` — re-renders the caller only when *that* id's status flips.
- `useToggleFavorite()` — stable action selector.

In-memory only. Persistence (`zustand/middleware` `persist` + AsyncStorage) is a deliberate follow-up — AsyncStorage is a native module + rebuild, out of scope for "add missing pieces."

### `useFetchWallpapers` hook (`hooks/useFetchWallpapers.ts`)

`useFetchWallpapers(categoryId, count)` → `{ wallpapers, loading, error, refetch }`. Wraps `getCategoryPhotos` from mock data. Data is synchronous today so `loading` is `true` for exactly one render then `false` — honest, not a fake timer. The value is the **seam**: swapping in a remote API later changes only this hook's body, no call sites.

### expo-image migration

All photo rendering moved from RN `Image` / `ImageBackground` to `expo-image` for caching + load transitions:

- Plain `Image` → `expo-image` `Image` with `contentFit="cover"` + `transition`: `CategoryPreviewList`, `app/category/[id].tsx`, `app/wallpaper/[id].tsx`.
- `app/wallpaper/[id].tsx` also switched `onLoadEnd` → `onLoad` and `resizeMode` → `contentFit` (expo-image's API). The blur-on-load overlay UX is unchanged.
- `ImageBackground` → `<View>` + absolute-fill `expo-image` `Image` as first child, then overlay content: `GlassCard`, `CollectionGrid`, `ThemeBasedRow`. This exactly replicates what `ImageBackground` does internally (View + absolutely-positioned image + children), so layouts are byte-identical — the layout style stays on the `View`, the old `imageStyle` (border radius) moves onto the absolute `Image`.

### Wiring

- `app/category/[id].tsx` — rewritten: photos now come from `useFetchWallpapers` (with loading spinner + error/retry states); the local `useState<Set>` favorites was replaced by the Zustand store (`renderItem` selects the `ids` array directly since hooks can't be called inside `renderItem`).
- `app/wallpaper/[id].tsx` — the previously-dead heart button now reads `useFavoritesStore` and toggles; icon switches `heart-outline` ↔ solid pink `heart`.

### CLAUDE.md relocation

`CLAUDE.md` was found inside `changes/` — it won't be auto-loaded there. Moved to the project root and brought current (it predated changes 005/006/007: still described the BlurView tab bar, lavender accents, `ImageBackground` components, and omitted the `category/[id]` route). Added `store/` + `hooks/` to the architecture section and an "images: always expo-image" convention.

## Files changed

- `package.json` — added `zustand: ^5.0.2`
- `store/favorites.ts` — **new** (Zustand store + selector hooks)
- `hooks/useFetchWallpapers.ts` — **new** (local-data fetch hook with loading/error/refetch)
- `app/category/[id].tsx` — rewritten: expo-image, `useFetchWallpapers`, Zustand favorites, loading/error states
- `app/wallpaper/[id].tsx` — expo-image (`onLoad`/`contentFit`/`transition`), heart wired to store
- `components/CategoryPreviewList.tsx` — RN `Image` → expo-image
- `components/GlassCard.tsx` — `ImageBackground` → `View` + absolute expo-image
- `components/CollectionGrid.tsx` — `ImageBackground` → `View` + absolute expo-image
- `components/ThemeBasedRow.tsx` — `ImageBackground` → `View` + absolute expo-image
- `CLAUDE.md` — moved from `changes/` to repo root + updated to current state

## Verification

After Metro restart (`npx expo start --clear`, port 8081 clear):

- Open a category → brief "Loading wallpapers…" spinner, then the 2-col grid. Images fade in (expo-image `transition`).
- Tap a heart in the category grid → fills pink. Open that same photo's detail screen → its heart is already pink (shared Zustand state). Toggle it there → reflected back in the grid.
- Scroll Featured / Theme Based / Popular Collections — cards render through expo-image with the same glass/gradient overlays as before, no layout shift.
- No `ImageBackground` or RN `Image` imports remain in source (`grep` confirms only `node_modules/expo-image` matches).

## Notes

- **Favorites don't persist** across app restarts yet — in-memory Zustand. Add `persist` middleware + `@react-native-async-storage/async-storage` when persistence is needed (native module → requires a rebuild).
- `useFetchWallpapers` is wired into the category screen only. The home screen still imports mock data directly for its preview rows — fine, since those are deterministic previews, not "fetched" lists. Wire the hook in there too if the home sections should show loading states.
- `useIsFavorite` / `useToggleFavorite` are the intended component API. Inside `FlatList renderItem` (not a real component) select state directly off `useFavoritesStore` instead — that's why `app/category/[id].tsx` selects the `ids` array rather than calling `useIsFavorite` per row.
- expo-image `source` accepts both `{ uri }` and a bare string; kept `{ uri }` to minimize diffs.
