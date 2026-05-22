# Auto wallpaper shuffle — Phase 1 (UI + storage)

**Date:** 2026-05-16
**Type:** feature

## Problem

User asked for a full auto-wallpaper-changer feature: collections of 10
photos, configurable timers, multiple shuffle modes, premium gating, and
background execution that survives reboot. The product spec also called
for native deps (`react-native-background-fetch`, RevenueCat,
`react-native-device-info`, push notifications) and a 2017-era
`react-native-wallpaper-manager` package.

Several of those don't fit the project as it stands:

- `react-native-wallpaper-manager` was already declined in
  `changes/016` — the project ships its own local Expo module
  `modules/wallpaper-setter` (`changes/017`) that calls
  `WallpaperManager.setBitmap` directly.
- iOS does not allow programmatic wallpaper change at all (no Apple
  API, no entitlement). "Auto-shuffle" on iOS is fundamentally not
  possible — best we can do is save to Photos + manual guide.
- RevenueCat needs external setup (API keys, store products) the AI
  can't perform; wiring the SDK now would ship a paywall that does
  nothing until those are configured.
- Adding `react-native-background-fetch` + push deps requires
  `expo run:android` rebuild, which is a separate user action.

User confirmed Phase 1 scope via AskUserQuestion:

- UI + storage only (no new native deps)
- Android primary, iOS = guide-only
- `isPremium: boolean` stub in settings store
- New `app/shuffle/*` routes (not a bottom-tab slot)

## Solution

Phase 1 ships the entire UI surface + data model. The engine runs as a
foreground ticker (`setInterval` while the Active screen is mounted).
Phase 2 will swap that one `setInterval` for `react-native-background-fetch`
with the same `applyNext()` body — no data-model migration needed.

### Data model — `constants/shuffle.ts`

- `Collection { id, name, photoIds: string[10], timerId, customMinutes?, mode, createdAt }`
- `ShuffleHistoryItem { photoId, image, at, collectionId }`
- `ShuffleState { collections, activeCollectionId, currentIndex, history, paused, dndStart, dndEnd, lastChangedAt }`
- `TIMER_OPTIONS` — 7 entries; 4 free (1h/6h/12h/24h) + 3 premium (15m/30m/custom).
- `SHUFFLE_MODES` — sequential / random / day-based (free) + smart-time / mood (premium).
- Constants: `COLLECTION_SIZE=10`, `FREE_COLLECTION_LIMIT=1`, `HISTORY_LIMIT=30`.

### Store — `store/shuffle.ts`

Zustand store. Persistence uses `expo-file-system/legacy` (already a
dep — `lib/wallpaperActions.ts` uses it for image caching) and writes
a single JSON blob to `cacheDirectory/shuffle-state.json`. Writes are
debounced 250 ms so a rapid 10-tap image-picker session coalesces into
one fs write. `hydrate()` reads the file on first access.

Actions: `createCollection`, `updateCollection` (enforces 10-photo cap),
`deleteCollection`, `setActive` (resets `currentIndex` on switch),
`setPaused`, `setDnd`, `recordChange`, `clearHistory`. Plus selectors
`useCollections`, `useActiveCollectionId`, `useActiveCollection`,
`useCollectionById` that re-render only when their slice changes.

### Engine — `hooks/useShuffleEngine.ts`

Returns `{ status, intervalMs, skipNow, isIos }`. Internally:

1. Re-renders once per second (cheap, only while Active screen is mounted).
2. Computes `nextChangeAt = lastChangedAt + interval`.
3. When the interval expires, calls `applyNext(collection)`:
   - picks the next index per `mode` (sequential / random / day / smart / mood)
   - calls `setAsWallpaper(url, id, 'both')` from existing `lib/wallpaperActions`
   - on success, advances `currentIndex` and appends to `history` (capped 30)
4. Returns `idle` for: no-active, empty, paused, DND, or applying.

The `random` picker avoids immediate repeats. The `smart` picker
partitions the array in half — bright (early indices) by day,
dark (later) by night. `day` uses `Date.getDay() % count`. `mood`
falls through to sequential until a mood-detection signal exists in
the app.

### Premium gate — `components/PremiumLock.tsx`

`<PremiumLock />` is a small pill rendered on locked rows.
`gatePremium(onUnlock)` runs `onUnlock` if `settings.isPremium`,
otherwise pops an Alert with a dev "Upgrade" button that flips the
flag locally. Single seam to swap for `Purchases.getCustomerInfo()`
later — call sites don't change.

### Screens — `app/shuffle/*`

- **`index.tsx`** — Collections home. Lists every collection with
  stacked thumbnail preview, active badge, mode + timer summary.
  FAB creates a new one (gated by `FREE_COLLECTION_LIMIT`). Long-press
  deletes (with confirm). Top-right opens History. Banner up top
  links to the Active screen if a collection is running.
- **`[id].tsx`** — Collection detail. Name editor, the 3-col image
  picker (source: `searchCatalog`, the unified app library), 10-cap
  enforcement with a numbered selection badge, shuffle-mode selector
  with `PremiumLock` on smart/mood, timer selector with locks on
  15m/30m/custom, a custom-minutes input visible iff premium + custom
  selected. Big Start/Stop button at the bottom.
- **`active.tsx`** — Mounts `useShuffleEngine`. Renders the current
  wallpaper preview fullbleed, a top tag with the collection name,
  progress dots (one per slot, active is wider), and a glass status
  panel: "Next change in 14m 32s". Skip / Pause / Favorite actions.
  iOS shows a callout overlay: "Each change saves to Photos. Open
  Photos › Share › Use as Wallpaper to apply."
- **`history.tsx`** — Last 30 changes (`HISTORY_LIMIT`). Each row:
  thumbnail, photo id, formatted timestamp ("Today 14:32",
  "Yesterday 09:15", "May 12, 14:32"), heart button wired into the
  existing `favorites` store. "Clear" in the header empties history.

### Nav wiring

- `app/_layout.tsx` — register the 4 shuffle screens with
  `animation: 'simple_push'`.
- `app/(tabs)/profile.tsx` — new "Auto Shuffle" row in the Wallpaper
  Management section linking to `/shuffle`.

### Settings store

- `store/settings.ts` — add `isPremium: boolean` (default `false`).
  Existing per-field selectors keep working. Phase 2 swaps the
  `isPremium` selector for the RevenueCat entitlement check; no
  consumer changes.

## Files changed

**New:**

- `constants/shuffle.ts` — types, timer/mode catalogs, constants, DND helpers.
- `store/shuffle.ts` — Zustand store + expo-file-system persistence.
- `hooks/useShuffleEngine.ts` — foreground engine + countdown.
- `components/PremiumLock.tsx` — lock pill + `gatePremium()` helper.
- `app/shuffle/index.tsx` — Collections home.
- `app/shuffle/[id].tsx` — Collection detail (picker + settings).
- `app/shuffle/active.tsx` — Active shuffle screen.
- `app/shuffle/history.tsx` — History screen.

**Modified:**

- `store/settings.ts` — add `isPremium` field + default.
- `app/_layout.tsx` — register 4 shuffle routes (simple_push).
- `app/(tabs)/profile.tsx` — add "Auto Shuffle" row in Wallpaper
  Management; import `useRouter`.

## Verification

Pure-JS. No native rebuild.

```
npx expo start --clear
```

Then on device:

1. **Settings → Wallpaper Management → Auto Shuffle** — opens the
   collections home (empty state shown on first run).
2. **Tap "+"** — creates a collection, opens its detail. Pick 10
   photos (badge counts 1–10; the 11th tap shows the cap alert).
3. **Try premium options** — tap "15 min" or "Smart time" → paywall
   alert. Tap "Upgrade (dev)" to flip `isPremium` and unlock.
4. **Start shuffle** — taps you to the Active screen. Countdown
   ticks once per second. Tap **Skip** → wallpaper applies in one
   tap on Android (via the existing `wallpaper-setter` module);
   tap **Pause** → status flips to "Paused"; tap **Favorite** →
   heart toggles in the shared favorites store.
5. **Top-right time icon** — opens history. Heart any past row;
   tap a row to open the wallpaper preview.
6. **Long-press a collection** on the home screen → delete confirm.
7. **Cold restart the app** — collections, active id, and history
   reload from `cacheDirectory/shuffle-state.json`.

iOS:

- Same flow, but tapping Skip saves the image to Photos and deep-
  links to Photos.app. The Active screen shows the iOS callout
  pointing the user at Photos › Share › Use as Wallpaper.

## Notes

- **Phase 2 follow-ups** (require user action / rebuild):
  - `react-native-background-fetch` for true bg ticking (Android
    WorkManager headless). Phase 2 also adds the iOS limitation
    that bg-fetch on iOS has min 15 min interval and is best-effort.
  - `expo-notifications` for "Wallpaper changed", "Battery low",
    "Good morning" notifications.
  - `expo-battery` for the 15% skip threshold. Currently the
    battery check is a structural seam in the engine — always
    returns "OK" in Phase 1.
  - `react-native-purchases` (RevenueCat) wired against entitlement
    `"premium"`. Swap `useSettingsStore.getState().isPremium` for
    the entitlement check in `gatePremium()`.
- **Couple sync shuffle** was in the original spec. Skipped — needs a
  backend with accounts + push, neither of which exist in this
  project. Document and revisit if/when a server is added.
- **Mood-detection shuffle**: the app has user-selected mood filters,
  not detection. The `mood` mode falls through to sequential pending
  a real mood signal.
- **Foreground-only engine**: while the Active screen is mounted the
  countdown ticks and changes happen. When the user navigates away,
  React-Native-Screens `enableFreeze` (`changes/018`) pauses the
  effect, which means the engine sleeps. This is the intended Phase 1
  behavior — Phase 2's bg-fetch is what makes the shuffle survive
  app close / device sleep.
- **Storage location**: cacheDirectory was picked over documentDirectory
  because the file is fully regenerable from in-memory state, and
  cacheDirectory is safe to clear without losing irreplaceable data.
  If a user clears the app cache, collections disappear — acceptable
  for Phase 1; Phase 2 will move to a persistent location alongside
  the favorites/settings stores.
- **Reuses existing primitives**: `lib/wallpaperActions.setAsWallpaper`
  for the actual apply, `store/favorites` for heart, `searchCatalog`
  for the image library, `AnimatedButton` + `Glass` + `useTheme()`
  for the visual layer. No new design idioms.
