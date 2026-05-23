# Couple proximity reliability: permission, realtime backstop, battery, geofence

**Date:** 2026-05-23
**Type:** fix

## Problem
QA found the couple feature (pair two phones → when close, a shared wallpaper applies on both) worked in the owner's tests but was fragile in real conditions:
- **H3:** `enterLinkedMode` started location tracking *without requesting permission*, and was invoked via `void …` so a thrown permission error was silently swallowed. With foreground-only (or no) permission, the dashboard showed "live distance" forever with no data and no error.
- **H4:** "apply on both phones" depended **entirely** on Supabase Realtime delivering the partner's `couple_locations` row through a brittle subquery-based RLS policy. With no backstop, a **stationary** partner's phone might never recompute distance / flip proximity / apply — only the moving phone changed.
- **M3:** the foreground-service GPS stream ran at `timeInterval: 5s` + `distanceInterval: 0` + no auto-pause, always-on while linked = heavy battery drain; the module header comment still described an old "~30s" design.
- **M4:** the location task `await`ed `refreshCoupleGeofence()` *before* the wallpaper apply; `startGeofencingAsync` requires background ("Always") permission and throws on foreground-only, aborting the tick so the wallpaper never applied.

(SQL/RLS changes were out of scope for this client-only pass.)

## Solution
- **H3 — `lib/coupleBootstrap.ts`:** `enterLinkedMode` now calls `ensureBackgroundLocationPermission()` *before* `startCoupleLocation()`. `denied` / `foreground-only` push a clear message via the store's `setError` (already rendered on the dashboard) so the UI stops implying live tracking; `granted` clears any stale error. The stream still starts on `foreground-only` (it delivers while the app is open) and is skipped only on hard `denied`. The `void enterLinkedMode(...)` call site now has a `.catch` that logs instead of swallowing.
- **H4 — `lib/coupleBootstrap.ts`:** added a 25 s **partner-location backstop poll** started in `enterLinkedMode` and cleared in `exitLinkedMode` (no leak; re-armed on re-link). It fetches the partner's latest row via the existing `fetchPartnerLocation` and runs it through the same `setPartnerLocation → recomputeDistance` path, so a stationary phone still updates if a realtime event is missed. The wallpaper apply stays idempotent (`lastAppliedKey`/`inFlight` guard), so the poll never re-sets the wallpaper every tick.
- **M3 — `lib/coupleLocation.ts`:** raised the cadence `5s → 15s` (≈3× less battery). Kept `distanceInterval: 0` on purpose so a *stationary* couple's distance still refreshes (the owner's change-107 requirement — it must not freeze the way the old 30s/25m filter did). Updated the stale header + inline comments to the real values; foreground-service block unchanged.
- **M4 — `lib/coupleLocation.ts`:** the location task wraps `refreshCoupleGeofence()` in try/catch (it's a battery optimization, not load-bearing) so a foreground-only geofence throw can no longer abort the tick before `applyProximityWallpaper()` runs.

## Files changed
- `lib/coupleBootstrap.ts` — permission-before-start + error surfacing (H3); 25 s partner backstop poll started/cleaned-up (H4); `.catch` on the `void enterLinkedMode` call.
- `lib/coupleLocation.ts` — cadence 5s→15s with rationale, header comment refreshed (M3); geofence wrapped in try/catch so apply always runs (M4).

## Verification
- `npx tsc --noEmit` — clean for these files.
- On the two test phones (Xiaomi host + Vivo): grant only "While using the app" — dashboard now shows a clear "background location off" message instead of a frozen distance, and proximity still updates while the app is open. Move one phone away then back while the other stays still — the stationary phone now flips within ~25 s even if a realtime event is dropped.

## Notes
- Root cause of H4's fragility is the subquery-based RLS on `couple_locations` realtime delivery. The client backstop masks missed events; a proper fix is a server-side RLS/realtime simplification in a future Supabase migration — flagged, out of scope here.
- This change sits on top of the staged 105–107 couple work; `lib/coupleLocation.ts`'s 107 cadence is the line being adjusted by M3.
