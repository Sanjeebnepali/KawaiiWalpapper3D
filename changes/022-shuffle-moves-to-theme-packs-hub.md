# Shuffle moves into the Theme Packs hub

**Date:** 2026-05-16
**Type:** fix (UX) + feature

## Problem

`changes/021` shipped the auto-shuffle feature behind a Settings →
"Auto Shuffle" entry point on a dedicated `/shuffle` route. User
feedback: that's buried — the discoverable place is **Theme Packs**,
which is already reachable from the Home top-tab. Also: the built-in
theme packs (`themePacks` in `constants/mockData.ts`) already exist
as curated wallpaper sets; users should be able to one-tap shuffle
them without manually building a custom collection.

So the ask is twofold:

1. Move the shuffle hub onto `app/wallpapers/theme-packs.tsx` (the
   existing Home top-tab destination).
2. Show built-in theme packs **first** as one-tap shuffle sources;
   show user-built custom collections below.

## Solution

### 1. Data model — `seedPackId` on `Collection`

Added an optional `seedPackId?: string` to `Collection`. When set,
this collection was seeded from a built-in theme pack. Built-ins are
**exempt from the free-tier limit** — a free user can shuffle any of
the 6 ready packs without burning their custom slot.

`canAddCollection(isPremium)` now filters by `!c.seedPackId` so only
user-built collections count.

### 2. New action — `activateBuiltinPack`

```ts
activateBuiltinPack(seedPackId: string, name: string, photoIds: string[]): string
```

Upsert-and-activate: if a collection with this `seedPackId` already
exists, re-seed its photos (in case the pack source changed) and just
flip `activeCollectionId`. Otherwise create a fresh collection with
`seedPackId` set and activate it. Idempotent — tapping "Shuffle Pink
Lolita" twice is safe.

### 3. Rewritten `app/wallpapers/theme-packs.tsx`

Two sections in a single `ScrollView`:

- **Quick Start** (top) — the 6 built-in `themePacks` cards. Each card
  keeps its existing 2×2 thumbnail grid; the footer now holds a small
  "Shuffle" / "Active" pill that calls `activateBuiltinPack` and
  navigates to `/shuffle/active`. Tapping the thumbnail still opens
  the existing `/theme-pack/[id]` detail screen, so the "browse this
  pack" flow is unchanged.
- **My Collections** (below) — user-built collections, same stacked-
  thumbnail row that the old `/shuffle` hub used. Long-press a row to
  delete (with confirm). A dashed "+ Create custom collection" button
  at the bottom creates a new collection (gated by free-tier limit
  via `gatePremium`) and pushes the detail editor.

Plus the active-shuffle banner at the top (linking to `/shuffle/active`)
and a History icon in the header (linking to `/shuffle/history`).

### 4. Cleanup

- **Deleted** `app/shuffle/index.tsx` — the old hub is replaced.
- **`app/_layout.tsx`** — drop the registered `shuffle/index` screen.
- **`app/(tabs)/profile.tsx`** — Settings → "Auto Shuffle" row now
  pushes `/wallpapers/theme-packs` (kept as a secondary entry point;
  the primary is the Home top-tab "Theme Packs").
- **`app/shuffle/active.tsx`** — empty-state "Open collections"
  button now pushes `/wallpapers/theme-packs` ("Open theme packs").

The `shuffle/[id]`, `shuffle/active`, and `shuffle/history` routes
are unchanged — they're still the inner screens for editing,
running, and reviewing.

## Files changed

- `constants/shuffle.ts` — add `seedPackId?: string` on `Collection`.
- `store/shuffle.ts` — `canAddCollection` filters out built-ins;
  new `activateBuiltinPack` action.
- `app/wallpapers/theme-packs.tsx` — rewritten as the shuffle hub
  with Quick Start + My Collections sections, active banner, history
  link, `UserCollectionRow` helper, dashed Create button.
- `app/shuffle/index.tsx` — **deleted**.
- `app/_layout.tsx` — drop `shuffle/index` from the Stack.
- `app/(tabs)/profile.tsx` — repoint Auto Shuffle row to
  `/wallpapers/theme-packs`.
- `app/shuffle/active.tsx` — repoint empty-state button to
  `/wallpapers/theme-packs`; relabel "Open theme packs".

## Verification

Pure JS — no native rebuild.

```
npx expo start --clear
```

Then on device:

1. **Home → Theme Packs** (top tab) — lands on the new hub. Should
   show 6 Quick Start packs in a 2-col grid; "My Collections" empty
   state below; "+ Create custom collection" dashed button at the
   bottom.
2. **Tap "Shuffle" on any built-in pack** (e.g. "Pink Lolita") —
   the card's pill flips to "Active", a banner appears at the top,
   and the Active screen opens with a 10-dot progress strip and
   countdown ticking.
3. **Back to Theme Packs, tap "Shuffle" on a different pack** —
   first pack pill returns to "Shuffle", new pack flips to "Active".
4. **Tap "+ Create custom collection"** on free tier — creates one
   custom collection (counts against the 1-slot free limit). Tap
   "+" again → paywall Alert. "Upgrade (dev)" unlocks.
5. **Built-in shuffling does NOT burn the free slot** — verify by
   activating "Pink Lolita" first, then tapping "+ Create" — the
   first custom Create still works.
6. **Long-press a custom collection** → delete confirm (built-in
   packs can't be deleted this way; they're managed via "Shuffle"
   re-tap).
7. **Settings → Wallpaper Management → Auto Shuffle** — secondary
   entry point still works, pushes to the same hub.

## Notes

- **Why two entry points (top tab + Settings)?** The top tab is the
  discoverable primary path. The Settings row is kept for users who
  remember the original location and search for "shuffle" in
  Settings. Removing it would surprise them; the row is cheap.
- **Built-in pack edits**: a user can open a built-in collection
  in the detail editor (long-tap via My Collections won't list them,
  but the active banner → Active screen lets them tweak the
  active collection's timer/mode via a dedicated button — TODO,
  Phase 2). Photos remain re-seeded from the source pack on each
  activation, so manual photo swaps don't stick. This is
  intentional: built-ins are "templates", customs are persistent.
- **Active screen's preview** still pulls from history when present,
  else from `currentIndex` in the active collection. Works the
  same regardless of whether the active collection is a built-in
  or a custom.
- **Phase 2 follow-ups** from `changes/021` still apply:
  `react-native-background-fetch`, `expo-notifications`,
  `expo-battery`, `react-native-purchases`. Nothing here changes
  those.
- **Built-in pack count**: tied to `themePacks` length (currently 6).
  Adding a new pack in `mockData.ts` automatically lights up here —
  no UI changes needed.
