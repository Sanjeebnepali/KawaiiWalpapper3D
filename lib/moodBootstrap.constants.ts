/**
 * Pure, stateless constants extracted from `lib/moodBootstrap.ts`.
 *
 * Nothing here reads or writes module-level mutable state, calls a native
 * module, or triggers any subscription/side effect. The orchestration,
 * subscriptions, and stateful helpers stay in `moodBootstrap.ts`.
 */

/** Auto-detect cadence the FGS uses. Matches the "every ~30 min" UI
 *  copy in `app/(tabs)/mood.tsx`. Kept here as a single source of
 *  truth so a future setting can route through one constant. */
export const CONTEXT_MOOD_FGS_INTERVAL_MIN = 30;
