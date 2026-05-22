# White-Box Fix Report — Kawaii Baby Wallpapers HD

**Date:** 2026-05-21
**Companion to:** `WHITE_BOX_TEST_REPORT.md` (the 38-defect audit)
**Method:** 5 fix-engineers ran in parallel, one per subsystem, each editing only its own (disjoint) files. Integrated result verified with a single consolidated `tsc --noEmit`.

## Outcome
- **37 of 38 defects fixed.** 1 partial by design (COUPLE-7 — server-side enforcement shipped as a not-yet-applied migration so it can't block testing).
- **`tsc --noEmit`: 9 → 5 errors, zero new errors introduced.** All 4 tsc-confirmed defects cleared (MOOD-1, MOOD-2, SHUF-5, COUPLE-8/`couple.ts:192`).
- The 5 remaining errors are the documented non-defects: 3 `as Href` typedRoutes artifacts (`ai.tsx:222/477`, `ai/preview.tsx:222` — self-clear on Metro `.expo/types` regen) + 2 pre-existing native-module `addListener` typings (`modules/context-mood-foreground`, `modules/friend-checkin-foreground`).

---

## Couple proximity (7 fixed, 1 partial)
| ID | Status | What changed |
|---|---|---|
| COUPLE-1 | ✅ Fixed | Geofence task now bails early when paused; added a server-side RLS predicate so a paused couple's `couple_locations` are unreadable (defense-in-depth). `lib/coupleLocation.ts`, `supabase/couple_schema.sql`. |
| COUPLE-2 | ✅ Fixed | Added `WITH CHECK` mirroring `USING` on all 3 couple UPDATE policies so post-update rows are re-validated. `supabase/couple_schema.sql`. |
| COUPLE-3 | ✅ Fixed | `couple_settings` realtime handler now ignores DELETE and only applies fields present in `payload.new` — can't reset `paused`/`thresholdM`. `lib/couple.ts`. |
| COUPLE-4 | ✅ Fixed | `getBufferZone` gained an optional `thresholdM` arg that scales near/far by `thresholdM/100` (clamped 0.2–5×); `recomputeDistance` passes it. The configured threshold is honored again. `store/couple.ts`. |
| COUPLE-5 | ✅ Fixed | Geofence re-armed after every local location tick so its radius tracks the latest accuracy/threshold band. `lib/coupleLocation.ts`. |
| COUPLE-6 | ✅ Fixed | `enterLinkedMode` dedup keyed on `${userId}:${code}` and reset in `exitLinkedMode` — re-linking the same couple after sign-out/in restarts realtime + location. `lib/coupleBootstrap.ts`. |
| COUPLE-7 | 🟡 Partial (by design) | Added template migration `supabase/couple_entitlement_enforcement.sql` (entitlements table + `NOT_ENTITLED` guard), marked "apply only when subscriptions go live." Working RPC + `constants/billing.ts` untouched. |
| COUPLE-8 | ✅ Fixed | Normalized PostgREST FK embeds (`Array.isArray(x)?x[0]:x`) — fixes blank partner name AND the old `couple.ts:192` tsc error; re-grants inherited premium when status is linked. `lib/couple.ts`. |

## Mood / context engine (8 fixed)
| ID | Status | What changed |
|---|---|---|
| MOOD-1 | ✅ Fixed (tsc) | `scanNow` unmount path returns `{ status: 'ok' }` instead of bare `return` → always a valid `ScanResult`. `hooks/useMoodDetector.ts:125`. |
| MOOD-2 | ✅ Fixed (tsc) | Added `sleepwake` to `SOURCE_STYLE` (moon/lavender); re-iconed `background` to sparkles/cyan so they read distinctly. `app/mood/history.tsx`. |
| MOOD-3 | ✅ Fixed | `inferContextMood` extended to emit all 7 moods (steps-burst→surprised; contiguous hour bands add neutral/angry). `lib/contextMood.ts`. |
| MOOD-4 | ✅ Fixed | Persist the user's last-enabled driver and use it for the legacy multi-driver tie-break instead of fixed array order. `lib/moodHistory.ts`, `store/mood.ts`, `lib/automationMode.ts`, `lib/moodBootstrap.ts`. |
| MOOD-5 | ✅ Fixed | `autoApplySleepWake` returns early if already applied today (per-kind day-stamp) — no re-apply/duplicate history on re-presented notifications. `lib/moodNotifications.ts`. |
| MOOD-6 | ✅ Fixed | `loadMoodMode` parses hours/minutes with a validate-and-fallback helper so corrupt storage can't feed `NaN` to the OS trigger. `lib/moodHistory.ts`. |
| MOOD-7 | ✅ Fixed | `recordMood` serialized through a module-level promise queue; dedup window extended to background/sleepwake. `lib/moodHistory.ts`. |
| MOOD-8 | ✅ Fixed | Deleting the active mood pool now also disables `backgroundEnabled` so the context FGS isn't left armed-but-dead. `app/mood/pool/[id].tsx`. |

## Shuffle / wallpaper (7 fixed)
| ID | Status | What changed |
|---|---|---|
| SHUF-1 | ✅ Fixed | `precacheCollection` routes `content://` through `downloadToCache` to a real `file://` before the native FGS — gallery photos now apply in background. `lib/shuffleActions.ts`. |
| SHUF-2 | ✅ Fixed | Day-mode skips the instant apply so it only rotates on the midnight boundary (no double-change near midnight). `app/shuffle/[id].tsx`. |
| SHUF-3 | ✅ Fixed | `maybePromptBackgroundAccess` reads persisted `bgAccessPrompted` and returns early — no re-nag every launch. `lib/backgroundAccess.ts`. |
| SHUF-4 | ✅ Fixed | After a successful cache clear, re-precaches + re-arms the active shuffle so rotation doesn't silently die. `app/(tabs)/profile.tsx`. |
| SHUF-5 | ✅ Fixed (tsc) | Dropped `{ size: true }` from `getInfoAsync` (the `'size' in info` guard already handles it). `lib/wallpaperActions.ts:337`. |
| SHUF-6 | ✅ Fixed (needs native rebuild) | `ShuffleScheduler.start` clears `KEY_LAST_AT`/`KEY_LAST_URI` so a new collection can't inherit the previous one's last-applied image. `ShuffleScheduler.kt`. |
| SHUF-7 | ✅ Fixed | Removed the dead `lastPromptPackage` variable. `lib/appUsageMonitor.ts`. |

## AI generator (7 fixed + reset action)
| ID | Status | What changed |
|---|---|---|
| AI-1 | ✅ Fixed | Synchronous `inFlightRef` guard rejects the 2nd same-tick tap → no concurrent generations. `app/(tabs)/ai.tsx`. |
| AI-2 | ✅ Fixed | `ai.tsx` reads `useLocalSearchParams` and seeds the prompt once → "Retry with this prompt" works. |
| AI-3 | ✅ Fixed | `client.ts` reserves a quota slot synchronously at call-start (released on error) → daily cap can't be overshot under concurrency. |
| AI-4 | ✅ Fixed | Auto-save gated on a `fresh:'1'` param → re-opening a past generation no longer re-saves a duplicate. `ai.tsx`, `ai/preview.tsx`. |
| AI-5 | ✅ Fixed | `busy`/`abortRef` reset in a `finally` → cancel race can't strand the button. `ai.tsx`. |
| AI-6 | ✅ Fixed | Clamp HF `estimated_time` to 60s; retry timer stored in a ref (cleared on unmount), routed through the in-flight guard. `huggingface.ts`, `ai.tsx`. |
| AI-7 | ✅ Fixed | `durationMs` persisted in `AIGeneration` and shown for re-opened generations. `store/ai.ts`, `client.ts`, `ai.tsx`. |
| (extra) | ✅ Added | `store/ai.ts` `reset()` — clears in-memory AI state for the sign-out fix to call. |

## Core / auth / data (8 fixed)
| ID | Status | What changed |
|---|---|---|
| CORE-1 | ✅ Fixed | `onAuthStateChange` subscription captured in a module var and unsubscribed before re-subscribing → no stacked listeners. `store/auth.ts`. |
| CORE-2 | ✅ Fixed | `signOut()` clears favorites + AI state and resets profile/user/session/status → next user can't inherit data. `store/auth.ts`. |
| CORE-3 | ✅ Fixed | `bootstrap()` wrapped in try/catch; on error sets `status:'anon'`; `bootstrapped=true` only after success → can't strand in `loading`. `store/auth.ts`. |
| CORE-4 | ✅ Fixed | New `components/ErrorBoundary.tsx` (themed fallback + "Try again") wraps `<RootStack/>`. `app/_layout.tsx`. |
| CORE-5 | ✅ Fixed | `hydrateSettingsStore()` called directly in the root effect → no theme flash / silent revert if mood bootstrap changes. `app/_layout.tsx`. |
| CORE-6 | ✅ Fixed | `refreshProfile` logs errors + retries once; verify gate only routes to profile-setup on a genuine null `display_name`. `store/auth.ts`, `app/(auth)/verify.tsx`. |
| CORE-7 | ✅ Fixed | `getPhotoById` returns `undefined` for unresolvable ids (no fabricated picsum); preview renders an "unavailable" state. `constants/mockData.ts`, `app/wallpaper/[id].tsx`. |
| CORE-8 | ✅ Fixed | Favorites/Settings writes gated on `hydrated`; `hydrate()` merges pre-hydration mutations → no clobber race. `store/favorites.ts`, `store/settings.ts`. |

---

## Verification
- `npx tsc --noEmit`: **5 errors total** (was 9). Zero originate from fixed code. Remaining = 3 `as Href` typedRoutes artifacts + 2 native-module typings (all pre-existing non-defects per the audit appendix).
- Each agent independently confirmed its edited files produce no tsc errors; the consolidated run above confirms the integrated tree.
- This is a static fix pass — see "runtime smoke-tests" below for what to confirm on-device.

## Manual follow-ups (action required)
1. **Apply Supabase SQL by hand** (Supabase SQL editor): re-run the updated `supabase/couple_schema.sql` (idempotent `drop policy if exists`+`create policy`) to deploy the COUPLE-1 pause read-block and COUPLE-2 `WITH CHECK` clauses. **Do NOT run** `supabase/couple_entitlement_enforcement.sql` until subscriptions go live (it would raise `NOT_ENTITLED` and block testing).
2. **Native rebuild required** for SHUF-6 (Kotlin `ShuffleScheduler.kt`) and to exercise the COUPLE-5 geofence on-device: `npx expo run:android`. The other 35 fixes are JS/TS and ship on a Metro `--clear` reload.
3. **When subscriptions launch:** add a `NOT_ENTITLED` mapping to `lib/couple.ts:translateError` for a friendly toast.

## Recommended runtime smoke-tests
- Sign out on a shared device → confirm favorites/profile are gone for the next user (CORE-2).
- Force a render throw → confirm the ErrorBoundary fallback + "Try again" works (CORE-4). Note: the fallback uses static `Colors`, not `useTheme()`, on purpose (theme context could be implicated in the throw).
- AI: double-tap Generate (one request), "Retry with this prompt" (prefills), re-open a past generation (no duplicate save).
- Shuffle a gallery (`content://`) collection with the screen off → confirm it rotates (SHUF-1).

## Cosmetic note
- MOOD-2 changed the "Auto/background" history pill from moon/lavender to sparkles/cyan so Sleep/Wake (moon/lavender) reads distinctly. One-line revert if the owner prefers the old icon (then Sleep/Wake needs a different glyph).

## Scope deliberately NOT changed
- `SUBSCRIPTIONS_ENABLED` stays `false` (testing) — confirm/flip before production launch.
- Per-`user.id` namespacing of persist keys (longer-term CORE-2 hardening) — sign-out wipe closes the shared-device leak for now.
