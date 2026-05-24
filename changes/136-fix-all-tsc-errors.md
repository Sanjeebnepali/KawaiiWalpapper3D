# Fix the 5 pre-existing tsc errors — repo now typechecks clean

**Date:** 2026-05-24
**Type:** fix

## Problem

`npx tsc --noEmit` reported 5 errors that had existed since before this session (they
were the "5 pre-existing" baseline referenced throughout the refactor campaign). They
show as red in the editor. Two distinct causes:

1. **Misapplied `as Href` cast (3×)** — `app/ai/preview.tsx`, `hooks/useAiGenerator.ts`
   (×2). The object form `router.push({ pathname: '…' as Href, params })` cast the
   *pathname* field to the whole `Href` union (`string | HrefObject`), but pathname is
   typed `string` → "Type 'string | HrefObject' is not assignable to type 'string'".
2. **Undeclared `addListener` (2×)** — `modules/context-mood-foreground/index.ts:53`,
   `modules/friend-checkin-foreground/index.ts:73`. The module types
   (`NativeModule<{onTick}> & {...}`) didn't declare `addListener`, but the bridge calls
   `native.addListener('onTick', cb)`.

## Solution

Type-only, behaviour-neutral fixes:

1. Removed the misplaced ` as Href` from the three object-form `pathname` literals — a
   plain string literal satisfies the `string` field. (The correct string-form casts
   like `router.push('/(tabs)/profile' as Href)` were left untouched.)
2. Added an explicit `addListener(event: 'onTick', listener): EventSubscription` member
   to both foreground-module types.

## Files changed

- `app/ai/preview.tsx`, `hooks/useAiGenerator.ts` — drop misapplied pathname casts.
- `modules/context-mood-foreground/index.ts`, `modules/friend-checkin-foreground/index.ts` — declare `addListener`.

## Verification

`npx tsc --noEmit` → **0 errors** (was 5). `npm test` → 8 suites, **137 tests pass**.
No runtime behaviour change (type-only).

## Notes

- The repo now typechecks completely clean — no red in any file. Combined with change 135
  (mood.tsx emoji fix), there are no error/garbled lines remaining.
