# AI: actually delete generated images

**Date:** 2026-05-19
**Type:** feature

## Problem

User: "one problem how can user delete the generate image can you
add this feature in this."

Two surfaces in the AI feature needed real deletion:

1. **Preview screen "Discard" button.** Existed visually (change
   070's tertiary action row) but only called `router.back()` —
   the file stayed in `cacheDirectory`, the history entry stayed
   in the store. "Discard" was a lie.
2. **AI tab "Recent generations" strip.** Tapping a thumb routes
   to preview; there was no way to remove a single thumb from
   history without flushing the entire history via Settings.

## Solution

A single shared deletion pipeline + two entry points.

### 1. `lib/ai/client.ts:deleteGeneration(localUri)`

The new "delete" primitive. Does three things, in order:

1. **Removes from AI history** via the new
   `useAIStore.removeGeneration(localUri)`.
2. **Scrubs the URI from every shuffle / mood collection** that
   referenced it. This matters because users can add a generated
   image to a mood pool via the preview's "Add to pool" button. If
   we deleted the cache file without scrubbing the pool's
   `photoIds`, the pool would end up with a broken URI and the
   next `WallpaperManager.setBitmap` call on that slot would
   throw the same `Failed to decode bitmap` error class we hit in
   the shuffle log (still pending, see notes).
3. **Unlinks the cache file** via `FileSystem.deleteAsync(uri,
   { idempotent: true })`. Idempotent so a second call (double-tap
   bug) doesn't throw.

Returns `{ ok, removedFromPools }` so the caller can craft an
accurate toast — "Deleted" vs "Deleted · also removed from 2 pools."

### 2. `store/ai.ts:removeGeneration(localUri)`

Pure store update. Filters the history array, persists. No
FileSystem imports here — the store stays pure, file ops live in
the client. Early-returns if the URI doesn't match anything in
history so a double-tap doesn't burn a persist write.

### 3. Preview screen wiring (`app/ai/preview.tsx`)

`onDiscard` renamed in spirit — title flipped from "Discard this
image?" to "Delete this image?", icon stays trash, accentColor
set to `Colors.error` so the alert reads destructive. The
confirm "Delete" button calls `deleteGeneration(uri)` and routes
back immediately (fire-and-forget unlinks the file in the
background so the user doesn't watch the file ops complete).
Toast on completion includes the pool-scrub count when
applicable.

### 4. AI tab strip wiring (`app/(tabs)/ai.tsx`)

- New `onDeleteHistoryItem(localUri)` callback — same
  premiumAlert + `deleteGeneration` pipeline as the preview's
  delete.
- Each `Pressable` in the recent-generations strip gets
  `onLongPress={() => onDeleteHistoryItem(g.localUri)}` and
  `delayLongPress={350}` (matches the long-press pattern used
  elsewhere in the app, e.g. mood pool photo removal).
- New `recentHead` row above the strip with `recentHint` text on
  the right reading "Long-press to delete" so the gesture is
  discoverable. The hint sits at `fontSize: 10`, `Colors.textMute`
  — present but not loud.
- Recent strip auto-refreshes after deletion because the AI
  screen reads `history` via a Zustand selector
  (`useAIStore((s) => s.history)`); the store change triggers a
  re-render.

## Files changed

- `store/ai.ts` — `removeGeneration` method.
- `lib/ai/client.ts` — `deleteGeneration` public function +
  imports for FileSystem and useShuffleStore.
- `app/ai/preview.tsx` — onDiscard rebuilt for real deletion;
  title/copy/accent updated; toast variants.
- `app/(tabs)/ai.tsx` — `deleteGeneration` import,
  `onDeleteHistoryItem` callback, long-press on every strip cell,
  new `recentHead` + `recentHint` row + styles.
- `changes/README.md` — index row.

## Verification

JS-only — `run` to rebuild.

After install:

1. **Generate** two or three images via the AI tab.
2. **Long-press a thumb in Recent generations.**
   - Expected: "Delete this image?" alert with Cancel / Delete.
   - Tap Delete → toast "Deleted" → thumb disappears from the
     strip.
3. **Preview Discard:**
   - Tap a thumb → preview opens → tap "Discard."
   - Expected: same alert → Delete → preview navigates back →
     toast → that image is no longer in the recent strip.
4. **Pool-scrub variant:**
   - Generate → preview → "Add to pool" → return to AI tab.
   - Open Mood → bottom strip → tap your mood pool → confirm the
     generated image is in the grid.
   - AI tab → long-press the thumb → Delete.
   - Expected: toast says "Deleted · also removed from 1 pool."
   - Mood pool → tap to verify the image is gone from there too.

## Notes

- **Cache file deletion is best-effort.** If `deleteAsync` throws
  (file already gone, permission flake), the history + pool refs
  are already cleared before that call, so the user-visible
  outcome is correct. `__DEV__` warn line preserved for diagnostic
  cases.
- **Pool-scrub crosses store boundaries.** `lib/ai/client.ts` now
  imports `useShuffleStore` in addition to `useAIStore`. Tight
  coupling but appropriate — the AI feature reaching into the
  shuffle store is the same direction the preview's "Add to pool"
  already runs (the preview pushes URIs into shuffle store too).
  No new circular dependency.
- **The leaked shuffle bitmap decode failure** mentioned in
  earlier logs is NOT resolved by this change — it was about a
  separate cache file going corrupt. Still pending; documented
  as a follow-up.
- **Long-press discoverability** — the "Long-press to delete"
  hint is small (10 dp, textMute) on purpose. Power users see it,
  casual users don't get visual clutter. If telemetry later shows
  nobody finds it, promote to a clearer affordance (e.g., a
  delete button overlay on each thumb).
- **Undo** is not supported. Adding `removeGeneration` undo would
  require keeping the cache file around for an undo window, which
  defeats the user's "I want this gone" intent. Deletion is
  immediate and final.
