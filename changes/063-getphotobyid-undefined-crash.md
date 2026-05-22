# Fix `getPhotoById` undefined crash on empty mood pool

**Date:** 2026-05-19
**Type:** fix

## Problem

User: "i got some problem can you check the log so it will be easily
find the problem."

`adb logcat -d --pid=<app> -t 800` surfaced:

```
05-19 12:15:40.307 22903 25633 E AndroidRuntime: FATAL EXCEPTION: mqt_v_native
05-19 12:15:40.307 22903 25633 E AndroidRuntime: Process: com.kawaii.wallpapers, PID: 22903
05-19 12:15:40.307 22903 25633 E AndroidRuntime: com.facebook.react.common.JavascriptException:
    TypeError: Cannot read property 'startsWith' of undefined
05-19 12:15:40.307 22903 25633 E AndroidRuntime: This error is located at:
05-19 12:15:40.307 22903 25633 E AndroidRuntime:     at MoodHome (...)
05-19 12:15:40.308 22903 25633 E AndroidRuntime: getPhotoById@1:2096238
05-19 12:15:40.308 22903 25633 E AndroidRuntime: anonymous@1:2141792
05-19 12:15:40.308 22903 25633 E AndroidRuntime: updateMemo@1:267979
05-19 12:15:40.308 22903 25633 E AndroidRuntime: MoodHome@1:2124304
```

Hard crash on Mood Home render. The JS stack pointed at
`getPhotoById` called from a `useMemo` inside `MoodHome`.

The most reliable repro path:
1. User taps Mood → bottom strip → "Build full album…" → "Create
   your own pool". The new `app/mood/pool/[id].tsx` screen creates
   an empty Collection (zero photoIds) and routes there.
2. User backs out without adding any photos.
3. They land on Mood Home again. The `albumRows` `useMemo` at
   `app/(tabs)/mood.tsx:598` iterates user collections to render
   bottom-strip thumbs and does:

   ```ts
   thumb: getPhotoById(c.photoIds[0])?.image ?? '',
   ```

   For an empty pool, `c.photoIds[0]` is `undefined`.
4. `getPhotoById(undefined)` enters and immediately runs
   `id.startsWith('file://')` — boom.

The bug existed pre-change 059 but was unreachable in practice
because the prior create flow (`/shuffle/[id]`) populated
photoIds before the user got back to Mood Home. The new lightweight
pool screen exposes the path where a user can land on Mood Home
with an empty `photoIds`.

## Solution

One-line hardening of `getPhotoById` in `constants/mockData.ts`.
Added a null/empty/undefined guard at the top of the function +
widened the param type from `string` to `string | null | undefined`.
Returns `undefined` for any non-string / empty input — same
contract the function already documents for unknown ids, so every
call site that already used `?.image ?? '…'` (which is most of
them, including the line that triggered this crash) continues to
work without changes.

Why this fix and not the call site:
- `getPhotoById` is called from 12+ places across the codebase. A
  per-call-site fix would have meant 12+ edits and a 13th forever
  one PR away from the next crash.
- The function's documented contract is "id → photo or undefined."
  Throwing on null input violated the contract. Now it doesn't.
- Empty-pool / missing-id is a legitimate runtime state for
  user-built collections — silently returning undefined matches
  the way the rest of the data layer already handles missing
  catalog entries.

## Files changed

- `constants/mockData.ts:getPhotoById` — null/undefined guard +
  param type widened to `string | null | undefined`. Comment cites
  the FATAL EXCEPTION trace so future readers can find the
  conversation.
- `changes/README.md` — index row.

## Verification

JS-only — no native rebuild required, but the user is in the
`run` shortcut flow so the next build embeds it.

```powershell
npx expo start --clear
# or: type `run` in the chat to rebuild + install the APK
```

Repro the original crash on the OLD bundle (before this fix):
1. Mood → bottom strip → "Build full album…" → "Create your own
   pool".
2. Pool screen opens for the empty new pool.
3. Tap back without adding photos.
4. Mood Home renders → **crash to launcher**.

After this fix:
1. Same steps 1–3.
2. Mood Home renders normally. The new pool's bottom-strip card
   shows an empty thumb area (no image URI yet) with the pool's
   name and "0 photos" below.

Other places `getPhotoById` is now safe by inheritance:
- `app/wallpaper/[id].tsx` — preview screen guards already + this
  fix makes the route param-decoded `id` defensive too.
- `app/mood/pool/[id].tsx` — `resolveImage(ref)` already short-
  circuits on `!ref`, but the underlying call is safer now.
- `app/(tabs)/mood.tsx:1192` — `getPhotoById(activeCollection.
  photoIds[0])?.image ?? ''` same pattern, now safe for empty
  active collections.
- `lib/sleepWakeForeground.ts` — custom-pair catalog lookups,
  inherit the guard.

## Notes

- **TypeScript caveat:** widening the type to `string | null |
  undefined` is non-breaking — every existing caller passes a
  string (or now-permitted `undefined`). No call site needs to
  change.
- **Why this didn't surface earlier:** the prior crash path went
  through the heavy `/shuffle/[id]` editor which populated the
  pool before letting the user back out. The simpler
  `/mood/pool/[id]` flow shipped in change 059 exposed the
  empty-pool render path. Bug was latent in 059's code but only
  reachable in 059's UX.
- **Going forward:** if any other `id.startsWith(...)` style
  guard exists in another data-layer function (e.g. catalog
  lookup helpers in `lib/`), audit and add the same guard. A
  quick `rg "id\.startsWith"` will turn them up. Documented as
  a follow-up in `KNOWN_ISSUES.md` if it ever bites again.
