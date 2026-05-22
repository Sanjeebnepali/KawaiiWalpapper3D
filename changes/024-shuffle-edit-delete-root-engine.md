# Shuffle fixes: editable built-in packs, robust delete, root-mounted engine

**Date:** 2026-05-16
**Type:** fix

## Problem

User reported three concrete bugs on the Theme Packs / Auto-Shuffle flow:

1. **Built-in packs (Quick Start) couldn't be edited.** Once "Pink Lolita"
   etc. was shuffled, there was no way to change its timer, switch to
   Day-based / Smart-time mode, etc. The pack card only routed to a
   read-only pack browser (`/theme-pack/[id]`).
2. **Couldn't delete shuffled wallpaper albums.** Built-in pack collections
   were filtered OUT of "My Collections" so the long-press-to-delete
   affordance didn't apply, and there was no edit screen to reach the
   trash icon. Even for user collections, the detail-screen delete could
   render a "Collection not found" flash before the back animation.
3. **Auto-shuffle never fired after the timer elapsed.** The engine was
   scoped to `app/shuffle/active.tsx` — leave that screen and the
   `setInterval` died (plus `enableFreeze(true)` from changes/018
   actively pauses off-screen routes). Users tapped Shuffle, navigated
   away, and the wallpaper never changed.

## Solution

### 1. Built-in packs are now editable

- New store action `ensureBuiltinPackCollection(seedPackId, name, photoIds)`
  in `store/shuffle.ts` — get-or-create the backing Collection WITHOUT
  activating it. Sister to the existing `activateBuiltinPack` (which
  creates AND activates + resets index).
- `app/wallpapers/theme-packs.tsx` `PackCard` now takes an `onConfigure`
  callback wired to a new `onConfigurePack` handler that calls
  `ensureBuiltinPackCollection` and pushes `/shuffle/[collectionId]`.
- Two ways to reach edit (per AskUserQuestion answer):
  - **Long-press anywhere on the pack card** → opens edit (creates
    Collection lazily). Works for inactive packs too.
  - **When active**, the secondary albums-icon button swaps to a
    settings cog (`settings-outline`) and routes to edit instead of the
    pack browser. The primary `Shuffle` CTA continues to act as
    re-shuffle / show LIVE.
- This also resolves Issue 2 for built-in packs — the edit screen
  has the trash icon they were missing.

### 2. Delete is defensive

- `app/shuffle/[id].tsx` `onDelete`:
  - Captures `targetId` before showing the Alert so the deferred
    callback doesn't deref a possibly-null `collection`.
  - Calls `router.back()` BEFORE `deleteCollection` so the back
    animation starts immediately. The delete runs in a `setTimeout(…, 0)`
    so the route can pop without rendering a "Collection not found"
    intermediate frame.
  - Wraps the store mutation in try/catch with a toast fallback.
- `app/wallpapers/theme-packs.tsx` long-press delete (user collections)
  also gets the try/catch + toast.

### 3. Engine moves to the app root

- `hooks/useShuffleEngine.ts` split into two exports:
  - **`useShuffleEngineHost()`** (new) — drives the tick from the root.
    Runs `setInterval(TICK_MS = 10_000)`, reads the active collection
    + paused + DND state from the store on every tick (so user edits
    take effect without restarting the interval), and calls
    `applyNext()` when `lastChangedAt + interval` is in the past. Gated
    on `AppState.currentState === 'active'` to avoid wasted work while
    backgrounded.
  - **`useShuffleEngine(collection)`** (existing, simplified) — Active
    screen's read-only status hook + manual `skipNow()`. The tick
    `useEffect` was removed; only the 1-second re-render-for-countdown
    interval remains.
  - Both paths call a shared `applyNext()` guarded by a module-level
    `applyInFlight` mutex so a manual Skip never collides with a
    scheduled tick.
  - First-tick safety: if `lastChangedAt` is null when the host fires
    (apply-on-activation failed), it sets `lastChangedAt = Date.now()`
    instead of firing immediately, so a full interval passes before the
    next attempt.
  - Failure backoff: after a failed apply, the host skips for
    `ERROR_BACKOFF_MS = 60_000` so a permanent permission denial
    doesn't spam-retry every 10 s.
- `components/ShuffleEngineHost.tsx` — new headless component that
  calls `useShuffleEngineHost()` and returns `null`.
- `app/_layout.tsx` mounts `<ShuffleEngineHost />` inside
  `BottomSheetModalProvider`, so the engine ticks for the entire app
  session.

## Files changed

**New:**

- `components/ShuffleEngineHost.tsx` — headless mount point for the root tick.

**Modified:**

- `hooks/useShuffleEngine.ts` — split into `useShuffleEngineHost` (root,
  drives ticks) and `useShuffleEngine` (Active screen, UI only); shared
  `applyNext` with module-level mutex; `AppState` gating + error backoff.
- `store/shuffle.ts` — add `ensureBuiltinPackCollection` action +
  matching type.
- `app/_layout.tsx` — import + mount `<ShuffleEngineHost />`.
- `app/wallpapers/theme-packs.tsx` — wire `ensureBuiltinPackCollection`,
  add `onConfigurePack` handler, pass `onConfigure` to `PackCard`,
  long-press on `PackCard` opens edit, active packs show gear icon
  instead of albums icon and route to edit; user-collection delete
  wrapped in try/catch + toast.
- `app/shuffle/[id].tsx` — defensive `onDelete`: capture `targetId`,
  `router.back()` first, deferred `deleteCollection` in try/catch.

## Verification

Pure JS — no native rebuild required.

```
npx expo start --clear
```

Then on device:

1. **Home → Theme Packs → tap "Shuffle" on Pink Lolita** — wallpaper
   applies immediately, navigate to Active.
2. **Back to Theme Packs** — Pink Lolita card shows the gear icon
   (instead of the albums icon) in the bottom-right corner of the card.
3. **Tap the gear icon** — opens the edit screen for Pink Lolita.
   Change timer to "6 hours" and mode to "Day-based". Tap Back.
4. **Long-press an inactive pack** (e.g., Cyberpunk Baby) — opens edit
   screen. Verify the picker is pre-filled with the pack's 10 photos.
   Back out without starting.
5. **Edit screen → trash icon → confirm Delete** — should pop back to
   Theme Packs with no "Collection not found" flash. The corresponding
   pack card returns to inactive state (no LIVE pill, albums icon
   instead of gear).
6. **Custom collection → long-press in My Collections → Delete** —
   confirm works without error.
7. **Auto-shuffle test (the big one):**
   - Open edit on a custom collection, pick 10 photos, set timer to
     "15 min" (premium — upgrade dev) or change `TIMER_OPTIONS` in
     `constants/shuffle.ts` to add a 1-min option for testing.
   - Tap Start — wallpaper applies immediately, navigate away to Home
     or any other tab.
   - Wait the interval. The wallpaper should change WITHOUT having to
     reopen the Active screen.

## Notes

- **Why `setTimeout(…, 0)` in delete?** React batches state updates but
  `router.back()` triggers a navigation transition that needs the
  current screen to remain valid for a few frames. Deferring the store
  mutation lets the back animation begin before the
  `useCollectionById(id)` selector returns null.
- **Why a module-level `applyInFlight` mutex instead of per-instance?**
  The Active-screen hook (Skip button) and the root host both call
  `applyNext()`. A React-level ref wouldn't be shared across the two
  hooks. The module-level boolean is the simplest correct primitive
  for "one apply at a time across the whole app."
- **`AppState` gating, not bg-fetch.** When backgrounded, the JS
  setInterval still fires in theory but the OS throttles it and the
  user can't see results anyway. Phase 2 (`react-native-background-fetch`)
  is the proper fix for "shuffle while the app is closed" — this change
  only fixes "shuffle while the app is open but not on the Active
  screen."
- **TICK_MS = 10 s** is plenty for the shortest non-custom interval
  (15 min = 900 s). For a custom 5-min interval the shuffle will fire
  within ±10 s of the target, which is fine.
- **Why not delete built-in packs in the Quick Start section directly?**
  Long-press on a pack card already navigates to the edit screen where
  the trash icon lives. Adding a second delete affordance on the card
  would duplicate the conventional gesture for "show overflow options."
