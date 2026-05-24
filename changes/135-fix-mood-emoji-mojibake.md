# Fix corrupted (mojibake) emoji in mood.tsx

**Date:** 2026-05-24
**Type:** fix (regression)

## Problem

`app/(tabs)/mood.tsx` displayed garbled text — e.g. `â˜€ï¸`/`ðŸŒ™` instead of `☀️`/`🌙`,
and `Ã¢Å"` instead of `✓`. Root cause: the change-128 styles-extraction agent re-wrote
`mood.tsx` and **double-encoded every multibyte char** (its UTF-8 bytes were mis-read as
Windows-1252 and re-saved as UTF-8). Verified a regression: at `e88985b` (pre-session)
`mood.tsx` had **0** double-encoding markers; after change 128 it had **626**. No other
file was affected (compared every `.ts/.tsx` against `e88985b` — only `mood.tsx`
increased).

## Solution

Reversed the cp1252 double-encoding losslessly: read the file as UTF-8 → re-encode as
cp1252 (recovering the original UTF-8 bytes) → write. Used a throw-on-unencodable
encoder so it would abort rather than lose data if the corruption weren't a clean
cp1252 round-trip — it completed without error (96,134 → 93,103 bytes).

## Files changed

- `app/(tabs)/mood.tsx` — emoji/special chars restored (string + comment bytes only; no
  code structure change; still 2345 lines).

## Verification

- Double-encoding markers: 626 → **0**. Replacement chars (U+FFFD): **0** (no data loss).
- `{selectedWake ? '☀️' : '🌙'}` and `Mood Home — entry point` render correctly.
- `npx tsc --noEmit` → same 5 pre-existing errors, **0 new** (only string/comment bytes changed).
- `git diff` touches only `mood.tsx`.

## Notes

- Lesson: sub-agents writing files on this Windows setup can mis-encode UTF-8 emoji on a
  full rewrite. mood.tsx was the only file rewritten that was emoji-dense; all other
  agent-written files were checked clean against the pre-session baseline.
- Separately still open: 5 pre-existing `tsc` errors (expo-router `as Href` casts +
  two native-module `addListener` typings) — not from this campaign; addressed next.
