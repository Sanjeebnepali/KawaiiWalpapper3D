# Mood Based theme: actually rotate the wallpaper while the phone screen is off

**Date:** 2026-05-20
**Type:** fix

## Problem

User report:

> *"hey i got problem in moodbased them when phone is turn off at that
> time our app doesnot work can you fix this and for all can you recheck
> whether it is true or not"*

"Phone turn off" here means *screen off / phone locked* — not a literal
power down. The user enables the **Even when app is closed → Auto-change
in background** toggle on the Mood tab (Tier 4 — `backgroundEnabled` in
the mood store), locks the phone, waits, and the wallpaper never
changes.

Audit confirmed the report. Changes/075 had moved Auto mood detection
onto a native Android Foreground Service
(`modules/context-mood-foreground/`), so the **tick fires reliably**
every 30 min even with the screen off. But the work the tick fires
silently no-oped for two compounding reasons:

1. **Same-mood dedupe in `runMoodBackgroundOnce`.** In
   `lib/moodBackgroundTask.ts` (lines 210-211 before this change):

   ```ts
   const lastBgMood = moodState.lastBgMood;
   if (lastBgMood === ctx.mood) return false;
   ```

   `inferContextMoodNow` (`lib/contextMood.ts`) maps the wall-clock hour
   into a mood bucket — happy 06-10, excited 10-14, neutral/calm 14-18,
   calm 18-22, sad 22-02, neutral 02-06. With a 30-min FGS tick cadence,
   most ticks land in the same bucket as the previous tick. The dedup
   meant the apply was skipped for hours at a time, and the user
   correctly reported "nothing changes." This is the same UX bug the
   camera path already removed — see the history note in
   `components/MoodEngineHost.tsx:84-91`:

   > "Earlier versions skipped re-apply when the detector returned the
   > same mood as the last apply ... Both versions left the user staring
   > at the same wallpaper for minutes despite the camera scanning every
   > 60 s, which read as 'broken' — even though the algorithm was
   > correct."

   The dedup was never removed from the BG path even though `pickPhoto
   ForMood` (`lib/moodBucket.ts`) already takes an `excludeId` argument
   and falls back to a different photo in the same bucket — so removing
   the dedup naturally rotates within the bucket every tick.

2. **`downloadToCache` always re-downloads — fails on a locked phone.**
   In `lib/wallpaperActions.ts`, the helper was:

   ```ts
   const target = `${FileSystem.cacheDirectory ?? ''}kawaii-${sanitize(id)}.jpg`;
   const res = await FileSystem.downloadAsync(url, target);
   if (res.status !== 200) throw new Error(`Download failed (HTTP ${res.status})`);
   return res.uri;
   ```

   No cache check. Every apply re-runs the network round-trip. Locked
   phones routinely have Wi-Fi suspended (Android's "Wi-Fi sleep
   policy") and Doze cuts background data — so the FGS tick happily
   fires, JS happily computes the next mood, and the apply silently
   throws inside `downloadAsync`. The catch in `setAsWallpaper` returns
   `{ ok: false }` and the JS path swallows it.

   This bug ALSO costs latency on every foreground apply (always a
   re-fetch, even immediately after the previous one), and battery on
   every shuffle/sleep-wake precache that happens to re-resolve URLs
   the cache already had.

## Why the OTHER timed features are unaffected (per the "recheck for all" ask)

The user asked to verify the bug for the rest of the timed features
too. Verdict: **no**, only Mood Based is broken in this way.

- **Theme-pack Shuffle** (`modules/shuffle-foreground/`): the native
  `ShuffleForegroundService` decodes the wallpaper and calls
  `WallpaperManager.setBitmap` ENTIRELY IN KOTLIN, from pre-cached
  `file://` URIs supplied at start. No JS round-trip on tick. Works
  with the JS bridge asleep, on a locked screen, offline. Already
  battle-tested in changes/051.
- **Sleep/Wake mode** (`modules/sleep-wake-foreground/`): same pattern
  — `applyWallpaperFromLocalUri` runs natively from URIs pre-cached
  via `lib/sleepWakeForeground.ts` → `downloadToCache`. The pre-cache
  *did* re-download more than necessary because of bug #2 above, but
  the apply itself works offline.
- **Friend Check-in** (`modules/friend-checkin-foreground/`): only
  posts notifications — no wallpaper apply, no network needed. Tick
  → JS → `fireMoodPromptNotification()`. Works as long as the JS
  bridge stays alive, which the FGS contract guarantees (changes/075
  note "JS keepalive assumption").
- **Daily Mood Prompt**: backed by `expo-notifications`'
  `scheduleNotificationAsync` calendar trigger — posted by the OS
  directly, doesn't depend on JS being alive.

So bugs #1 and #2 are specific to the Mood Based path. The fix for
bug #2 (cache short-circuit) also incidentally cleans up the
shuffle / sleep-wake precache cost — a nice side effect, not the
motivation.

## Solution

### 1. Drop the same-mood dedup in `runMoodBackgroundOnce`

`lib/moodBackgroundTask.ts` — the two lines that read `lastBgMood`
and short-circuit are replaced with a comment explaining why, mirror-
ing the same reasoning the camera path uses. `pickPhotoForMood` is
already configured with `currentPhotoId` as `excludeId`, so a
same-mood tick rotates to a different photo in the bucket rather
than freezing. The `setLastBgMood(ctx.mood)` write is kept so the
store stays internally consistent if other code starts reading
`lastBgMood` later (no current readers, but cheap to keep).

### 2. Make `downloadToCache` idempotent

`lib/wallpaperActions.ts` — before calling `FileSystem.downloadAsync`,
probe the target path with `getInfoAsync`. If it exists and is
non-empty, return it unchanged. The path is derived from a stable
`id`, and:

- Catalog ids (e.g. `mood-happy-3`) resolve to deterministic picsum
  URLs (`https://picsum.photos/seed/<seed>/<w>/<h>`) — same seed
  always returns the same bytes.
- User-pasted internet URLs derive their id from a djb2 hash of the
  URL itself, so identical URLs reuse the same cache file (`downloadIn
  ternetImage` in the same file).
- User-picked gallery photos (`file://` / `content://`) already
  short-circuit before reaching the cache check.

`Settings → Clear Cache` (existing `clearAppCache` in the same file)
still works for users who want fresh downloads.

### 3. Pre-warm the Mood Collection cache on toggle-on

`lib/moodBootstrap.ts` — new `precacheMoodCollection()` helper that
reuses `lib/shuffleActions.ts`' `precacheCollection`. Resolves every
photo id in the active Mood Collection to a local `file://` URI.
Called from:

- Bootstrap step 3 — right after `startContextMoodForeground(...)`,
  when `backgroundEnabled` is already on at app launch (covers app
  restart after the user had toggled it on previously).
- Store subscriber — when `backgroundEnabled` flips off→on (toggle
  handler).
- Store subscriber — when `moodCollectionId` changes WHILE
  `backgroundEnabled` is on (user swaps the active pool without
  toggling off).

The first FGS tick on a locked screen then finds local files in the
cache and never touches the network. Without this precache, the
cache-hit check from change #2 would only help on the SECOND tick;
this gets us to "works first time."

`precacheCollection` itself swallows per-photo download failures
(`results.filter((u): u is string => …)`), so a partial network
outage still gets us a partial cache — better than no cache.

## Files changed

- `lib/wallpaperActions.ts` — cache-hit `getInfoAsync` short-circuit
  in `downloadToCache` for http(s) URLs. ~10 lines of new code +
  comment. Doesn't change the file://, content://, or download-failure
  branches.
- `lib/moodBackgroundTask.ts` — remove the `lastBgMood === ctx.mood`
  dedup return inside `runMoodBackgroundOnce`. Replace with a comment
  explaining the rationale + reference to the camera-path history note.
- `lib/moodBootstrap.ts` — new `precacheMoodCollection()` helper,
  imported `precacheCollection` from `./shuffleActions`, wired into
  bootstrap step 3 (when `backgroundEnabled` is already on) and the
  store subscriber (toggle-on + collection-swap-while-on).
- `changes/README.md` — index row.
- `changes/076-mood-based-locked-screen-fix.md` — this doc.

## Verification

JS-only change — Metro reload picks it up (no `npm install`, no
`expo run:android`):

```powershell
npx expo start --clear
```

Or hit `r` in an already-running Metro session.

On device, after the new bundle loads:

1. **Same-mood rotation:**
   - Mood tab → set "Auto-change in background" ON (Pool must be
     picked first).
   - Open the dev-only "Run now" button (`__DEV__ && backgroundEnabled`
     row in the bg card) — tap it once, note which wallpaper applied.
   - Tap it AGAIN immediately (no time passed → context-mood is the
     same).
   - **Expected:** the wallpaper rotates to a different photo in the
     same mood bucket.
   - **Before this change:** second tap returned "No change (same
     mood)" and nothing rotated.

2. **Cache-hit short-circuit:**
   - With background on + collection picked, run "Run now" twice in
     quick succession. The second apply should feel near-instant on
     screen (no network round-trip).
   - Turn airplane mode ON, then "Run now" again. The wallpaper
     should still rotate (cache hit) instead of toasting a download
     failure.

3. **Locked-screen end-to-end:**
   - Background on, pool picked, phone freshly online.
   - Confirm the ongoing notification "Kawaii Baby — Auto mood
     detection" sits in the shade.
   - Lock the phone for 35 minutes.
   - Unlock → open Mood Home → "Currently applied" thumb should be
     a DIFFERENT photo from before locking, with the "via Background
     (time + steps)" caption. History entry within the past few
     minutes with `'background'` source.
   - **Before this change:** same photo as before locking; no new
     history entry.

4. **OEM autostart sanity (Vivo / MIUI / ColorOS only):**
   - The autostart hint in the bg-card footer still applies — without
     OS-level autostart permission, even the FGS gets killed and no
     amount of JS-side fixes help. Not regressed by this change.

5. **No regression in foreground "Set as wallpaper":**
   - Tap a wallpaper → bottom-sheet → Set as wallpaper. The same URL
     applies in both cold-cache and warm-cache paths. Visual result is
     identical; warm path is just faster.

## Notes

- **JS only — no native rebuild needed.** The two new Expo modules
  added in changes/075 stay; this change refines the JS that runs on
  each FGS tick. The user does NOT need to re-run `expo run:android`
  for this to land. Run `r` in Metro or reload the dev client.
- **Cache eviction.** `cacheDirectory` is wiped on app uninstall and
  whenever Android needs disk; the cache-hit check survives both
  (falls through to download on miss). `clearAppCache()` (Settings →
  Clear Cache) also works.
- **Why we kept `setLastBgMood` writes.** The dedup READ is gone, but
  the write stays in case a future feature wants to know "what was the
  most recently auto-applied mood" without re-reading mood history.
  Cheap to keep, harmless if unread.
- **Doze deep-sleep caveat.** The FGS notification exempts the service
  from Doze, but Android's deep-Doze maintenance windows can still
  briefly pause `Handler.postDelayed`. Real-world drift is seconds for
  the 30-min cadence — within the user's tolerance for "around every
  half hour." Documented in `ContextMoodForegroundService` KDoc.
- **Same fix shape is available for the camera path** if it ever ships
  again (it's currently `CAMERA_FEATURE_ENABLED = false` per
  changes/039). The camera tick already removed its own dedup; if the
  apply path is restored, it can reuse the same `downloadToCache`
  short-circuit transparently — no extra change needed there.
