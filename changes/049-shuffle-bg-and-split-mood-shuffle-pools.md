# Shuffle bg-tick + Mood/Shuffle pools split + Home grid spacing fix

**Date:** 2026-05-18
**Type:** fix

## Problem

Three user-reported bugs:

1. **Theme-pack shuffle doesn't fire while the app is closed.** User set
   a 5-min timer; after 5 min nothing happened — only when they opened
   the app and looked at the shuffle screen did the wallpaper finally
   rotate. This was the documented Phase-1 foreground-only limitation
   in `constants/shuffle.ts:6`.
2. **The "Create your own album" flow accidentally leaked between
   Mood-based and Theme-based.** Creating a custom collection in either
   surface made it appear in BOTH. The user wants them treated as
   separate libraries — a Mood pool is for the mood feature; a Shuffle
   pack is for theme-pack auto-rotation.
3. **Home page "Popular Collections" 2-col grid had wrong image
   placement.** Cards stacked with no vertical breathing room on the
   user's device.

## Root causes

### Cause A — No background runner for shuffle

`hooks/useShuffleEngine.ts:useShuffleEngineHost` only ticks while
`AppState.currentState === 'active'`. There was no equivalent of
`MOOD_BACKGROUND_TASK` that could advance the active shuffle when the JS
process was dead. Re-opening the app DID catch up at the first 10 s
foreground tick — but if the user just looked at the wallpaper from
the lock screen without opening the app, they perceived "nothing
changed."

### Cause B — Single user-collections list shared by two surfaces

`useShuffleStore.collections` was a single flat array. `app/mood/
pick-collection.tsx` listed everything where `!c.seedPackId`. `app/
wallpapers/theme-packs.tsx` did the same. So an album created in one
surface unavoidably surfaced in the other.

### Cause C — `gap` on FlatList contentContainerStyle isn't reliable on Android

`components/CollectionGrid.tsx` used `contentContainerStyle.gap: GAP`
for row spacing AND `columnWrapperStyle.gap: GAP` for column spacing.
On Android some RN versions skip the contentContainerStyle row-gap
when numColumns > 1, so the rows stacked with zero vertical gap.

## Solution

### 1. Background shuffle path

`lib/shuffleActions.ts` gains `runShuffleBackgroundOnce()` — a
single-shot version of the foreground tick logic (hydrate → read active
collection → check paused / DND / interval → call
`applyCollectionPhoto`). Wired into TWO places:

- **`lib/moodBackgroundTask.ts:runMoodBackgroundOnce`** — runs FIRST,
  before SW + mood-context paths. Independent of `isPremium` and of the
  mood-bg gates (a free user with an active shuffle should still get
  bg rotations). If it applied, returns early so the mood path doesn't
  immediately overwrite the just-set wallpaper in the same OS dispatch.
- **`hooks/useShuffleEngine.ts:useShuffleEngineHost`** AppState
  listener — fires on `'active'` so the user who closed the app for >
  the interval sees the wallpaper change THE MOMENT they open the app,
  instead of waiting up to 10 s for the foreground ticker. Closes the
  user-reported "I have to look at the shuffle screen first" gap.

`lib/moodBootstrap.ts` extended in two ways:

- Initial registration now triggers when ANY of (mood-bg /
  sleep-wake / active shuffle) is set — so a free shuffle user gets the
  OS dispatch scheduled.
- New `useShuffleStore.subscribe` registers / unregisters when an
  active shuffle is set / cleared. Combined re-check against the mood
  store so toggling any one off doesn't tear down the dispatch that
  the other two rely on.

### 2. Per-purpose user collections

`constants/shuffle.ts` adds `CollectionPurpose = 'shuffle' | 'mood'` and
an optional `purpose` field on `Collection`. Missing → treated as
`'shuffle'` (back-compat for persisted state from before this change).
Built-in seeded packs (`seedPackId` set) ignore `purpose` — curated
packs surface in BOTH places because the user might want to drive
mood OR shuffle from the same curated pool.

`store/shuffle.ts`:
- `createCollection(name, purpose?)` accepts the purpose, defaults to
  `'shuffle'`.
- `canAddCollection(isPremium, purpose?)` counts only collections
  matching the requested purpose. Free tier now gets ONE Mood pool +
  ONE Shuffle pack independently.

Call-site updates:
- `app/mood/pick-collection.tsx` — `userRows` filters
  `purpose === 'mood'`; `onCreate` calls `createCollection('My mood
  pool', 'mood')`; the cap message says "free accounts can build one
  mood pool".
- `app/wallpapers/theme-packs.tsx` — `userCollections` filters
  `(c.purpose ?? 'shuffle') === 'shuffle'`; the auto-name index is
  computed off the shuffle subset; `createCollection` explicit purpose
  arg.

### 3. CollectionGrid row spacing — switch to `ItemSeparatorComponent`

`components/CollectionGrid.tsx` — removed `gap: GAP` from
`contentContainerStyle.styles.grid`, added `ItemSeparatorComponent`
rendering a `<View style={{ height: GAP }} />` between rows.
`numColumns > 1` makes the separator render between ROWS (not items),
which is exactly what we want and works deterministically on every
Android version. Column gap (`columnWrapperStyle.gap`) is unchanged —
that one's reliable.

## Files changed

**Modified:**
- `constants/shuffle.ts` — `CollectionPurpose` type + `Collection.purpose`
  optional field.
- `store/shuffle.ts` — `createCollection` accepts `purpose`;
  `canAddCollection` counts per-purpose.
- `lib/shuffleActions.ts` — new `runShuffleBackgroundOnce()` exported
  helper; ported `pickNextShuffleIndex` + DND helper from the
  foreground host.
- `lib/moodBackgroundTask.ts` — calls `runShuffleBackgroundOnce` first
  in `runMoodBackgroundOnce`, returns early if it applied.
- `lib/moodBootstrap.ts` — registers the bg task when an active
  shuffle exists; subscribes to shuffle-store changes to register /
  unregister live; combined re-evaluation across all three drivers.
- `hooks/useShuffleEngine.ts` — `useShuffleEngineHost` AppState
  resume listener fires `runShuffleBackgroundOnce` immediately.
- `app/mood/pick-collection.tsx` — filters to `purpose === 'mood'`,
  creates with `'mood'`, updated cap copy.
- `app/wallpapers/theme-packs.tsx` — filters to shuffle-purpose,
  creates with `'shuffle'`, auto-name index off the filtered subset.
- `components/CollectionGrid.tsx` — `ItemSeparatorComponent` row gap.

## Verification

1. `npx expo run:android --variant release` (JS-only — no native dep
   added, but you can also re-install the existing release APK and the
   bundled JS will reflect these changes).
2. **Background shuffle:** Theme Packs hub → "Shuffle" any pack with
   a 5 min timer. Lock the phone. Wait 6 min without opening the app.
   Wake the lock screen — wallpaper has rotated. (Android note: OS may
   delay first dispatch by a few minutes under battery saver; if the
   OS hasn't ticked yet, opening the app will fire the resume listener
   and rotate immediately, no 10 s wait.)
3. **Resume-tick:** Set timer to 1 min. Background the app for 2 min.
   Foreground it — wallpaper rotates within ~1 s of the app becoming
   active (faster than the old 10 s foreground tick).
4. **Pool separation:** Mood tab → Set mood pool → Create your own
   pool → fill it with photos → back out. Open Theme Packs hub —
   the new mood pool does NOT appear under "My Collections". Now in
   Theme Packs hub → Create a custom shuffle pack → open the Mood
   pool picker — the new shuffle pack does NOT appear there either.
5. **Free-tier per-purpose cap:** as a free user, create both one
   mood pool AND one shuffle pack without any Premium upsell. Try to
   create a second of either — Premium gate fires.
6. **Built-in packs unaffected:** the curated theme packs still show
   in both surfaces (Mood picker rows + Theme Packs hub heroes).
7. **Home grid spacing:** Home → scroll down to Popular Collections —
   the 2-col grid has clear vertical breathing room between rows
   (matches the column gap visually).

## Notes

- **The shuffle bg task lives inside `MOOD_BACKGROUND_TASK`, not its
  own task definition.** Reason: Android `expo-background-fetch` only
  schedules ONE periodic worker per app — adding a second task ID
  doesn't double the cadence, it just multiplexes within the same
  worker. Sharing the task keeps the code simpler and matches the
  Android model.
- **Existing persisted collections from before this change** were
  created without a `purpose` field. They're treated as `'shuffle'`
  via the `?? 'shuffle'` fallback in the filter expressions — so they
  STAY in the Theme Packs hub (which is what the user wants, since
  that's where they originally created them).
- **No change to Sleep/Wake pools.** Those have their own pack catalog
  (`constants/sleepWakePacks.ts`) and custom-pair store fields; they
  never went through the collections array and remain untouched here.
- **Phase 2 follow-up filed:** the bg dispatch cadence on Android is
  OS-decided (typically 15 min – 2 h under aggressive battery
  policies). For a user who set a 5 min interval and locks their phone
  in a Doze-aggressive state, the actual lag may exceed 5 min between
  rotations. There's no fix for that without a foreground service —
  reserved for Phase 2 alongside the explicit "while app closed"
  permission/disclosure copy.
