# White-box defect fixes — 37/38 from the audit

**Date:** 2026-05-21
**Type:** fix

## Problem

The white-box audit (`WHITE_BOX_TEST_REPORT.md`) found 38 substantiated defects
across 5 subsystems (couple, mood, shuffle/wallpaper, AI, core/auth/data),
including 4 tsc-confirmed errors, a shared-device privacy leak, an
unrecoverable-white-screen risk, two broken features, and several
background-reliability bugs.

## Solution

Fixed in parallel, one engineer per subsystem editing disjoint files; docs +
verification done as a single pass. **37 fixed, 1 partial by design.** Full
per-defect detail in `WHITE_BOX_FIX_REPORT.md`. Headlines:

- **Core:** added `components/ErrorBoundary.tsx` (wraps `RootStack`); `signOut()`
  now clears favorites/AI/profile (shared-device leak); `bootstrap()` try/caught
  so it can't strand in `loading`; `onAuthStateChange` unsubscribed;
  `hydrateSettingsStore()` called in the root effect; `getPhotoById` returns
  `undefined` (no fabricated picsum) + preview "unavailable" state; favorites/
  settings hydration race closed.
- **AI:** synchronous in-flight guard (no double-generation); "Retry with this
  prompt" actually reads the param; daily-cap slot reservation; auto-save only
  for fresh generations; cancel/abort cleanup in `finally`; HF retry clamped +
  ref-tracked; `durationMs` persisted; new `store/ai.ts:reset()`.
- **Shuffle:** `content://` gallery photos copied to `file://` before the FGS
  (background rotation fix); Day-mode no double-change near midnight;
  `bgAccessPrompted` honored; cache-clear re-arms active shuffle; `getInfoAsync`
  type fix; `ShuffleScheduler.start` clears stale last-applied keys (native);
  dead var removed.
- **Mood:** `scanNow` always returns a `ScanResult`; `SOURCE_STYLE` gains
  `sleepwake`; `inferContextMood` covers all 7 moods; last-enabled-driver
  tie-break; sleep/wake per-day apply guard; NaN-safe hour parsing; serialized
  `recordMood`; deleting active pool disables the bg engine.
- **Couple:** RLS `WITH CHECK` on 3 UPDATE policies + paused read-block;
  realtime DELETE/partial payload ignored; `thresholdM` honored (scales the
  buffer band); geofence re-arm on accuracy change; re-link dedup keyed on
  user+code; PostgREST embed normalized (also clears `couple.ts:192`); inherited
  premium re-granted on hydrate. COUPLE-7 server-side entitlement shipped as a
  not-yet-applied migration template.

## Files changed
See `WHITE_BOX_FIX_REPORT.md` for the full per-defect file/line list. Touched:
`store/{auth,favorites,settings,couple,mood,ai}.ts`,
`lib/{couple,coupleLocation,coupleBootstrap,contextMood,moodBootstrap,moodNotifications,moodHistory,automationMode,shuffleActions,wallpaperActions,backgroundAccess,appUsageMonitor}.ts`,
`lib/ai/{client,providers/huggingface}.ts`,
`hooks/useMoodDetector.ts`,
`app/_layout.tsx`, `app/(tabs)/{ai,profile}.tsx`, `app/ai/preview.tsx`,
`app/wallpaper/[id].tsx`, `app/(auth)/verify.tsx`, `app/mood/{history,pool/[id]}.tsx`,
`app/shuffle/[id].tsx`, `constants/mockData.ts`,
`components/ErrorBoundary.tsx` (new),
`supabase/couple_schema.sql`, `supabase/couple_entitlement_enforcement.sql` (new),
`modules/shuffle-foreground/.../ShuffleScheduler.kt`.

## Verification
- `npx tsc --noEmit`: **9 → 5 errors, zero new**. 4 tsc-confirmed defects cleared
  (MOOD-1, MOOD-2, SHUF-5, COUPLE-8/`couple.ts:192`). Remaining 5 are documented
  non-defects: 3 `as Href` typedRoutes artifacts + 2 native-module `addListener`
  typings (pre-existing, out of scope).

## Notes
- **Apply manually:** re-run `supabase/couple_schema.sql` in the Supabase SQL
  editor (idempotent) for the COUPLE-1/2 RLS fixes. Do NOT run
  `couple_entitlement_enforcement.sql` until subscriptions go live.
- **Native rebuild** needed for SHUF-6 (Kotlin) + on-device COUPLE-5 geofence.
- `SUBSCRIPTIONS_ENABLED` intentionally left `false` (testing).
- Static fix pass — recommended runtime smoke-tests listed in the fix report
  (sign-out leak, ErrorBoundary, AI retry/double-tap, gallery shuffle offline).
- Cosmetic: MOOD-2 changed the "Auto" history pill icon (sparkles/cyan) so
  Sleep/Wake (moon/lavender) reads distinctly — trivially revertible.
