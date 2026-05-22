# White-Box Test Report — Kawaii Baby Wallpapers HD

**Date:** 2026-05-21
**Method:** White-box static analysis + logic/data-flow tracing across 5 subsystems in parallel (couple proximity, mood engine, shuffle/wallpaper, AI generator, core infra/auth/data).
**Scope:** `store/`, `lib/`, `app/`, `constants/`, `contexts/`, `hooks/`, `modules/`, `supabase/`.

## How to read this
- **Severity:** Critical (data loss / privacy / unrecoverable crash) · High (broken feature, security, leak) · Medium (wrong behavior in real use) · Low (cosmetic / dead code / type-only).
- **✅ tsc-confirmed** = the defect also shows up in `npx tsc --noEmit` output (objectively real). Others are code-traced and should be confirmed at runtime.
- Each item has a **Fix prompt** — a copy-pasteable instruction you can hand to a developer or to Claude Code to implement the fix.

## Priority fix order (top 10)
1. CORE-4 — No error boundary → white-screen on any render throw (Critical)
2. CORE-2 — `signOut()` leaks previous user's favorites/profile to next user (Critical, shared-device privacy)
3. CORE-3 — `bootstrap()` can strand the app in `status:'loading'` forever (High)
4. AI-2 — "Retry with this prompt" is fully broken (param never read) (High)
5. AI-1 — Double-tap fires two concurrent generations / double-charges quota (High)
6. SHUF-1 — `content://` gallery photos never apply in background rotation (High)
7. MOOD-1 — `scanNow()` can resolve `undefined` → crash on "Scan now" + navigate (High) ✅
8. CORE-1 — Auth `onAuthStateChange` listener never unsubscribed (High)
9. COUPLE-7 — Couple-premium gate is client-only; RPC has no server-side check (High, for production)
10. CORE-5 — Settings hydration coupled to Mood bootstrap → theme flash / silent revert (Medium)

---

## 1) Couple proximity subsystem

### COUPLE-1 — Pause relies on realtime; a killed-app partner can keep sharing briefly — Medium
- **Location:** `lib/coupleLocation.ts:62, 84-98`; `lib/couple.ts` (couple_settings realtime handler)
- **Problem:** Pausing flips a shared `couple_settings.paused` that syncs to both devices via the realtime channel, and both location tasks honor it — so pause IS bilateral while the websocket is alive. Residual gap: if a partner's app is killed (only the location foreground-service keeps the task firing) and the realtime websocket is down, that device may keep `pushMyLocation`-ing until reconnect. Also the geofence task doesn't check `paused` directly (mitigated because it routes through `applyProximityWallpaper`, which forces `far` when paused).
- **Fix:** Add server-side defense-in-depth: an RLS predicate / trigger that makes a paused couple's `couple_locations` unreadable, so no position flows regardless of client state. Optionally add a `paused` short-circuit at the top of the geofence task.
- **Fix prompt:** "Add server-side pause enforcement in supabase: a policy/trigger so that when a couple's `couple_settings.paused` is true, `couple_locations` rows for that couple are not selectable. Also add an early `if (useCoupleStore.getState().paused) return;` at the top of the COUPLE_GEOFENCE_TASK handler in lib/coupleLocation.ts."

### COUPLE-2 — `couple_settings` UPDATE RLS policy has no `WITH CHECK` — High
- **Location:** `supabase/couple_schema.sql` (the `couple_set: write couple` UPDATE policy; same omission on `couples: update own` and `couple_loc: update own`)
- **Problem:** Postgres UPDATE policies validate the *new* row only via `WITH CHECK`. These policies define only `USING`, so a couple member could craft an `.update()` that rewrites `couple_code`/`user_id`/`updated_by` to values outside their couple — the post-update tuple isn't re-validated.
- **Fix:** Add a `WITH CHECK (...)` mirroring each `USING (...)` clause.
- **Fix prompt:** "In supabase/couple_schema.sql add a `with check (...)` clause mirroring each `using (...)` clause to the three UPDATE policies ('couples: update own', 'couple_loc: update own', 'couple_set: write couple') so post-update values are validated to still belong to the caller's couple."

### COUPLE-3 — `couple_settings` realtime handler trusts partial/DELETE payloads → resets `paused` — Medium
- **Location:** `lib/couple.ts` (couple_settings `postgres_changes` handler)
- **Problem:** The handler reads `payload.new` for every event without branching on `eventType`. A DELETE or partial echo yields an undefined-field row; `setCoupleSettings` then can clear `paused` and reset `proximity_threshold_m` to its default. (Threshold reset currently has no effect because of COUPLE-4, but the `paused` reset is a real correctness risk.)
- **Fix:** Ignore `eventType === 'DELETE'`; only pass fields actually present in `payload.new`.
- **Fix prompt:** "In lib/couple.ts subscribeCouple's couple_settings handler, return early if payload.eventType is 'DELETE', and build the setCoupleSettings argument only from keys present in payload.new so an echo/partial payload can't reset proximity_threshold_m or clear paused."

### COUPLE-4 — `thresholdM` is mirrored from the DB but no longer used in the proximity decision — High
- **Location:** `store/couple.ts` (`recomputeDistance`, `getBufferZone`)
- **Problem:** Consequence of the changes/091 dynamic-buffer-zone refactor: `recomputeDistance` now derives `near/far` purely from `getBufferZone(accuracy)` and never reads `s.thresholdM`. The fetched/synced `couple_settings.proximity_threshold_m` is dead state — a future "set your threshold" UI would silently do nothing.
- **Fix:** Decide intentionally: either (a) remove `thresholdM` from the store/DB read path, or (b) scale `getBufferZone`'s near/far outputs by `thresholdM/100` so the configured value is honored.
- **Fix prompt:** "In store/couple.ts, make recomputeDistance honor s.thresholdM by scaling getBufferZone's near/far outputs proportionally to thresholdM/100 (or remove thresholdM from the store + lib/couple.ts fetch path if the band is intentionally fixed), so the dead state is resolved one way or the other."

### COUPLE-5 — Geofence not re-armed when GPS accuracy changes — Medium
- **Location:** `lib/coupleBootstrap.ts:69-76`; `lib/coupleLocation.ts:184-214`
- **Problem:** The geofence is re-armed only when the partner's lat/lng change, but its radius is the accuracy-scaled `far` band. If your accuracy degrades (walk indoors), the band should widen but the geofence keeps the stale radius, so the OS enter/exit wake fires at a different distance than `recomputeDistance` flips on.
- **Fix:** Re-arm on local location ticks (after `setMyLocation`) and/or on accuracy changes.
- **Fix prompt:** "In lib/coupleLocation.ts COUPLE_LOCATION_TASK handler, call refreshCoupleGeofence() after setMyLocation()/pushMyLocation() so the geofence radius tracks the latest accuracy band."

### COUPLE-6 — Re-login to the same couple in one JS session may not restart realtime/location — Medium
- **Location:** `lib/coupleBootstrap.ts:120-124, 153-158, 91-118`
- **Problem:** `enterLinkedMode` early-returns when `lastCouple === code`. Module-scope guards (`booted`, `lastUserId`, `lastCouple`) survive sign-out→sign-in in the same runtime, so re-linking to the same code can skip restarting the realtime channel + location task.
- **Fix:** Key the dedup on `${userId}:${code}` and reset it in `exitLinkedMode`.
- **Fix prompt:** "In lib/coupleBootstrap.ts, change the enterLinkedMode dedup from `lastCouple === code` to a `${userId}:${code}` key and reset it inside exitLinkedMode so re-linking the same couple after a sign-out/sign-in restarts realtime + location."

### COUPLE-7 — Couple-premium gate is client-only; the RPC enforces nothing — High (for production)
- **Location:** `lib/billing.ts:19-22`; `lib/couple.ts:46-48`; `supabase` `create_couple` RPC; `constants/billing.ts`
- **Problem:** With `SUBSCRIPTIONS_ENABLED=false` (current testing default) the paywall is fully open in the release build — intentional now, but confirm before launch. More importantly, even in production the gate is JS-only; `create_couple` has no entitlement check, so anyone with the anon key can call it directly and bypass the paywall. The "double-check so a stale build can't bypass" comment is not true (the check runs in JS).
- **Fix:** Enforce the entitlement server-side in `create_couple`; treat the JS gate as UX only.
- **Fix prompt:** "Add an `entitlements` table keyed on user_id with `couple_premium boolean`, and in the supabase create_couple() function raise 'NOT_ENTITLED' unless the caller has it (gated to when subscriptions are live). Confirm constants/billing.ts SUBSCRIPTIONS_ENABLED is intended false for this release."

### COUPLE-8 — Inherited premium not re-granted on reinstall; partner name can render blank — Low
- **Location:** `lib/couple.ts` (`acceptCoupleCode`, `fetchActiveCouple`)
- **Problem:** (a) Inherited Couple Premium is written only at accept time; a reinstall rehydrates the link but never re-derives the entitlement. (b) PostgREST FK embeds (`creator:profiles!fk`) can return a single-element array; the direct cast to `PartnerProfile|null` then yields a blank `display_name` (this is the existing `lib/couple.ts:192` tsc error too). ✅ tsc-related
- **Fix:** In `fetchActiveCouple`, set `isCouplePremium=true` when status is linked, and normalize embeds with `Array.isArray(x)?x[0]:x`.
- **Fix prompt:** "In lib/couple.ts fetchActiveCouple: when status==='linked' set isCouplePremium=true, and normalize the embedded creator/partner relations with `Array.isArray(x)?x[0]:x` before casting to PartnerProfile (also fixes the tsc:192 cast)."

---

## 2) Mood / context-mood subsystem

### MOOD-1 — `scanNow()` can resolve `undefined` → crash — High ✅ tsc-confirmed
- **Location:** `hooks/useMoodDetector.ts:125`
- **Problem:** `scanNow` is typed `Promise<ScanResult>` but the unmount path does a bare `return;` (→ `undefined`). Callers read `r.status` → `TypeError` if a scan resolves as the host unmounts ("Scan now" then navigate away). This is the `tsc` error at 125.
- **Fix:** Return a valid variant on the unmount path.
- **Fix prompt:** "In hooks/useMoodDetector.ts, change the bare `if (unmountedRef.current) return;` inside scanNow (~line 125) to `if (unmountedRef.current) return { status: 'ok' };` so it always resolves to a ScanResult."

### MOOD-2 — `SOURCE_STYLE` missing `sleepwake` → Sleep/Wake history mislabeled "Manual" — Medium ✅ tsc-confirmed
- **Location:** `app/mood/history.tsx:206-217`
- **Problem:** `Record<MoodSource,…>` defines only 4 of 5 sources; `sleepwake` entries fall back to the pink "Manual" pill. This is the `tsc` error at 206.
- **Fix:** Add a `sleepwake` style entry.
- **Fix prompt:** "In app/mood/history.tsx add a `sleepwake` entry to SOURCE_STYLE (label 'Sleep/Wake', moon icon, lavender tint/dim) so Sleep/Wake rows render correctly instead of falling back to 'Manual'."

### MOOD-3 — Context engine only emits 4 of 7 moods → 3 buckets unreachable in background — Medium
- **Location:** `lib/contextMood.ts:38-84` vs `lib/moodBucket.ts:19-24`
- **Problem:** `inferContextMood` returns only excited/happy/calm/sad, but `getMoodBucket` distributes photos across all 7 moods. ~43% of a curated pool (angry/surprised/neutral buckets) is never selected by the background path except via the random fallback.
- **Fix:** Extend `inferContextMood` to cover all 7 ids, or UI-gate the balance bar to the reachable buckets.
- **Fix prompt:** "In lib/contextMood.ts extend inferContextMood so its returned moods cover all 7 MOODS ids, mapping extra hour/step bands to neutral/surprised/angry, so background rotation can select photos bucketed to those moods."

### MOOD-4 — Legacy multi-driver normalization keeps the wrong driver — Medium
- **Location:** `lib/moodBootstrap.ts:97-100`; `lib/automationMode.ts:82-84`
- **Problem:** When >1 driver is persisted active, it keeps `activeDrivers[0]` (fixed order theme>mood>friend), not the user's most-recent choice — so Mood can silently turn itself off in favor of an old theme shuffle.
- **Fix:** Persist a "last enabled driver" marker and keep that.
- **Fix prompt:** "In lib/moodBootstrap.ts step 1a, persist which driver the user most recently enabled and pass it to enforceSingleDriver instead of activeDrivers[0]."

### MOOD-5 — Sleep/Wake auto-applies on every foreground notification → re-apply + duplicate history — Medium
- **Location:** `lib/moodNotifications.ts:163-189, 250-276`
- **Problem:** `handleNotification` calls `autoApplySleepWake` unconditionally; that function writes the day-stamp but never checks it, so a re-presented/coalesced notification re-sets the wallpaper and writes duplicate `sleepwake` history (not covered by the camera-only dedup).
- **Fix:** Gate `autoApplySleepWake` on the per-kind day-stamp.
- **Fix prompt:** "In lib/moodNotifications.ts autoApplySleepWake, return early if localDayKey(new Date()) already equals the store's sleepWakeLastWakeDay/LastSleepDay for the matching kind, so a re-presented foreground notification can't re-apply or duplicate history."

### MOOD-6 — Corrupt stored hour → `NaN` fed to the OS notification trigger — Low
- **Location:** `lib/moodHistory.ts:334-343` → `lib/moodNotifications.ts:431-435`
- **Problem:** `loadMoodMode` does `Number(raw)` with only a null-check; a corrupt value yields `NaN` into `trigger.hour`, so the daily/sleep-wake notification silently never schedules.
- **Fix:** Parse-and-validate with range fallback.
- **Fix prompt:** "In lib/moodHistory.ts loadMoodMode, replace raw Number(...) for notifHour/sleepWakeWakeHour/sleepWakeSleepHour/friendCheckInMinutes with a helper that falls back to the default when NaN or out of range."

### MOOD-7 — `recordMood` dedup is camera-only + non-atomic read-modify-write — Low
- **Location:** `lib/moodHistory.ts:188-202`
- **Problem:** Background ticks (no same-mood dedup) can fill the 60-entry ring within ~30h, evicting manual/camera history; concurrent producers (FGS tick + bg-fetch + tap) can clobber each other's write.
- **Fix:** Extend dedup to `background`; serialize writes behind a promise queue.
- **Fix prompt:** "In lib/moodHistory.ts, extend the same-mood dedup window to background/sleepwake sources and serialize recordMood through a module-level promise queue so concurrent writes don't read-modify-write over each other."

### MOOD-8 — Background engine left armed-but-dead after deleting the active pool — Low
- **Location:** `lib/moodBootstrap.ts:212-222`; `app/mood/pool/[id].tsx` `onDeletePool`
- **Problem:** Deleting the active pool calls `setMoodCollection(null)` but leaves `backgroundEnabled` true, so the FGS keeps running (battery + ongoing notification) while every tick no-ops on the null collection.
- **Fix:** Turn off `backgroundEnabled` + stop the FGS when the active pool is deleted.
- **Fix prompt:** "When the active mood pool is deleted (onDeletePool / any setMoodCollection(null) while backgroundEnabled), also disable backgroundEnabled and stop the context-mood foreground service."

---

## 3) Shuffle / wallpaper-apply subsystem

### SHUF-1 — `content://` gallery photos never apply in background rotation — High
- **Location:** `lib/shuffleActions.ts:255-256` → `modules/shuffle-foreground/.../ShuffleScheduler.kt:262-270`
- **Problem:** `precacheCollection` passes `content://` ids through unchanged; the native service only decodes `file://`/`/` paths, logs "skip non-local uri", and applies nothing for that slot while the app is closed — yet the index still counts it (rotation "skips a beat"). Works in-app (which copies via `downloadToCache`), dead in background. Reproduces the recurring "works when I'm looking, frozen when closed" report for gallery-built collections.
- **Fix:** Route `content://` through a copy to `file://` during precache.
- **Fix prompt:** "In lib/shuffleActions.ts precacheCollection, only pass file:// ids through unchanged; for content:// ids call `await downloadToCache(id, id)` so the gallery URI is copied to a file:// cache path before it reaches the native foreground service."

### SHUF-2 — Day-based collection can double-change within a minute near midnight — Medium
- **Location:** `app/shuffle/[id].tsx:297`; `ShuffleScheduler.kt:91-94`
- **Problem:** Activating a Day collection at 23:59 does an instant apply (image 0), then the midnight alarm fires ~1 min later → image 1, then nothing for 24h — violating "one new wallpaper per day."
- **Fix:** Skip the instant apply for `day` mode.
- **Fix prompt:** "In app/shuffle/[id].tsx toggleActive, skip the instant applyCollectionPhoto(...0) when collection.mode === 'day' so Day-based rotates only on the midnight boundary."

### SHUF-3 — `bgAccessPrompted` is written but never read → re-nags every launch — Medium
- **Location:** `lib/backgroundAccess.ts:179-198`
- **Problem:** Only the volatile `promptedThisSession` gates the battery-exemption prompt; the persisted flag is write-only, so a user who declines is re-prompted on every cold start while any background feature is on.
- **Fix:** Read `bgAccessPrompted` to suppress the auto-prompt (keep the manual trigger).
- **Fix prompt:** "In lib/backgroundAccess.ts maybePromptBackgroundAccess, read useSettingsStore.getState().bgAccessPrompted and return early at the app-launch entry if it's already true, so a user who declined isn't re-nagged every launch."

### SHUF-4 — `clearAppCache` deletes the precached shuffle pool → rotation dies silently — Medium
- **Location:** `lib/wallpaperActions.ts:328-350`
- **Problem:** Clearing cache deletes the `kawaii-*.jpg` files the native FGS rotates through; every subsequent `decodeFile` returns null and applies nothing, with no re-precache and no warning, until the app is reopened.
- **Fix:** After a successful cache clear, re-precache + re-arm the active shuffle.
- **Fix prompt:** "After clearAppCache succeeds, have the Settings caller re-invoke startForegroundShuffleForCollection for the active shuffle collection so the deleted file:// pool is re-downloaded and rotation doesn't silently die."

### SHUF-5 — `getInfoAsync(path, { size: true })` type error — Low ✅ tsc-confirmed
- **Location:** `lib/wallpaperActions.ts:337`
- **Problem:** Legacy `InfoOptions` no longer declares `size`; the call is the `tsc` error at 337. Runtime tolerates it; line 83 already uses the clean pattern.
- **Fix:** Drop the `{ size: true }` argument.
- **Fix prompt:** "In lib/wallpaperActions.ts:337 remove the `{ size: true }` argument from FileSystem.getInfoAsync(path) to match line 83; the `'size' in info` guard already handles the returned size."

### SHUF-6 — `ShuffleScheduler.stop` preserves `KEY_LAST_*` → stale attribution on next activation — Low
- **Location:** `modules/shuffle-foreground/.../ShuffleScheduler.kt:97-98`; `lib/shuffleActions.ts:138`
- **Problem:** `stop()` keeps `KEY_LAST_AT`/`KEY_LAST_URI`; a new collection's activation can briefly satisfy `last.at > lastChangedAt` and sync the previous collection's applied image/index into the new collection's history.
- **Fix:** Clear `KEY_LAST_AT`/`KEY_LAST_URI` in `start`.
- **Fix prompt:** "In ShuffleScheduler.start, also clear KEY_LAST_AT/KEY_LAST_URI (lastAppliedAt=0) when persisting a new rotation so syncFromNativeShuffle can't attribute the previous collection's last-applied image to a newly activated one."

### SHUF-7 — `lastPromptPackage` dead variable — Low
- **Location:** `lib/appUsageMonitor.ts:109, 168, 187`
- **Problem:** Written/reset but never read; the dedup is intentionally package-agnostic. Misleading leftover.
- **Fix prompt:** "In lib/appUsageMonitor.ts delete the unused lastPromptPackage variable and its assignment/reset since the dedup is package-agnostic."

---

## 4) AI generator subsystem

### AI-1 — Double-tap fires two concurrent generations / double-charges quota — High
- **Location:** `app/(tabs)/ai.tsx:140-172`
- **Problem:** The `if (busy) return;` guard relies on async React state and `setBusy(true)` runs late, so two taps in one tick both pass → two `generateImage` calls, two history records, two preview pushes.
- **Fix:** Gate on a synchronous ref.
- **Fix prompt:** "In app/(tabs)/ai.tsx add `const inFlightRef = useRef(false)`; at the top of onGenerate's async body do `if (inFlightRef.current) return; inFlightRef.current = true;` and clear it in a finally (and in onCancel) so double-taps can't launch two concurrent generations."

### AI-2 — "Retry with this prompt" is fully broken — High
- **Location:** `app/ai/preview.tsx:209-216` (sends param) vs `app/(tabs)/ai.tsx` (never reads it)
- **Problem:** `ai.tsx` never calls `useLocalSearchParams`, so the forwarded `prompt` is dropped — the retry lands on an empty prompt box.
- **Fix:** Read the param and seed the input once.
- **Fix prompt:** "In app/(tabs)/ai.tsx import useLocalSearchParams, read `{ prompt }`, and add a useEffect that calls setPrompt(prompt) once when it's a non-empty string so 'Retry with this prompt' pre-fills the box."

### AI-3 — Daily cap can be overshot by concurrent in-flight requests — Medium
- **Location:** `lib/ai/client.ts:34-57`
- **Problem:** `used = todayCount()` is read before firing; `recordGeneration` runs after the await. At `used === cap-1`, concurrent calls all pass and all record, exceeding the cap (real overspend on paid providers).
- **Fix:** Reserve a slot at call-start (roll back on error) or serialize calls.
- **Fix prompt:** "In lib/ai/client.ts generateImage, reserve a quota slot at the start (optimistic increment, release on error) or serialize calls behind a module-level in-flight promise so two calls at used===cap-1 can't both succeed."

### AI-4 — Auto-save re-saves duplicates when re-opening a past generation — Medium
- **Location:** `app/ai/preview.tsx:73, 93-101`
- **Problem:** `autoSavedRef` is mount-scoped; opening the same image from the recent strip re-mounts and re-saves a new `ai-${Date.now()}` gallery copy.
- **Fix:** Only auto-save fresh generations (param flag).
- **Fix prompt:** "Add `fresh:'1'` to the success router.push params in app/(tabs)/ai.tsx and only run the auto-save effect in app/ai/preview.tsx when params.fresh==='1', so re-opening a past generation doesn't re-save a duplicate."

### AI-5 — Cancel race can leave the Generate button stuck — Medium
- **Location:** `app/(tabs)/ai.tsx:99-103, 169-176`
- **Problem:** `busy` reset sits after an `if (ctrl.signal.aborted) return;` early-return; an abort racing the provider resolution can skip `setBusy(false)`, stranding the button on "Cancel".
- **Fix:** Reset `busy`/`abortRef` in a `finally`.
- **Fix prompt:** "In app/(tabs)/ai.tsx onGenerate, wrap generateImage in try/finally and reset setBusy(false)/abortRef.current=null in the finally instead of after the aborted early-return."

### AI-6 — `model_loading` retry is unclamped + can stack overlapping timers — Low
- **Location:** `app/(tabs)/ai.tsx:193-208`; `lib/ai/providers/huggingface.ts:288-291`
- **Problem:** Retry re-runs the whole handler after a server-controlled, unclamped delay with no in-flight coordination and no unmount cleanup.
- **Fix:** Clamp `estimated_time`; route retry through the in-flight guard; store/clear the timer in a ref.
- **Fix prompt:** "In lib/ai/providers/huggingface.ts clamp the 503 estimated_time to Math.min(estimated_time,60); in app/(tabs)/ai.tsx store the model_loading setTimeout id in a ref, clear it on unmount, and route the retry through the AI-1 in-flight guard."

### AI-7 — `durationMs` forced to `'0'` from the recent strip — Low
- **Location:** `app/(tabs)/ai.tsx:417-423`; `app/ai/preview.tsx:60, 251`
- **Problem:** `AIGeneration` never persists `durationMs`, so re-opened generations always show no timing (graceful, but a data gap).
- **Fix prompt:** "Add optional durationMs to AIGeneration in store/ai.ts, persist it in lib/ai/client.ts recordGeneration, and pass String(g.durationMs ?? 0) in the recent-strip push."

> Note: the `as Href` casts flagged by tsc in `ai.tsx`/`preview.tsx` are NOT defects — they're the documented `typedRoutes` regen timing artifact (CLAUDE.md). Harmless at runtime.

---

## 5) Core infra / auth / data layer

### CORE-4 — No React error boundary → white-screen on any render throw — Critical
- **Location:** `app/_layout.tsx:194-224` (none project-wide)
- **Problem:** Any uncaught render error unwinds to the root → red-box (dev) / blank white screen (release) with no recovery.
- **Fix:** Add a class `ErrorBoundary` wrapping `RootStack`.
- **Fix prompt:** "Create components/ErrorBoundary.tsx (getDerivedStateFromError + componentDidCatch) rendering a themed fallback + reload affordance, and wrap <RootStack /> in app/_layout.tsx with it."

### CORE-2 — `signOut()` doesn't clear favorites/profile → next user inherits data — Critical (shared-device privacy)
- **Location:** `store/auth.ts:84-86`; `store/favorites.ts` (global, non-namespaced key)
- **Problem:** Favorites persist under one global key, never cleared on sign-out; on a shared device user B sees user A's hearted wallpapers and overwrites A's list.
- **Fix:** Clear favorites/AI/profile on sign-out; longer-term namespace keys per `user.id`.
- **Fix prompt:** "In store/auth.ts signOut(), after supabase.auth.signOut() call useFavoritesStore.getState().clear(), reset AI history, and set({ profile:null, user:null, session:null, status:'anon' }) so a subsequent user doesn't inherit the previous user's data."

### CORE-3 — `bootstrap()` can strand the app in `status:'loading'` forever — High
- **Location:** `store/auth.ts:40-46`
- **Problem:** `bootstrapped=true` is set before an un-try/caught `await getSession()`; if it throws (corrupt session, bridge-not-ready), `status` stays `'loading'` forever and every `useRequireAuth` gate silently no-ops, with no self-heal.
- **Fix:** try/catch → set `status:'anon'` on error; set `bootstrapped=true` only after success.
- **Fix prompt:** "In store/auth.ts bootstrap(), wrap getSession()+listener setup in try/catch; on error set({ status:'anon' }) and only set bootstrapped=true after a successful getSession()."

### CORE-1 — Auth `onAuthStateChange` listener never unsubscribed — High
- **Location:** `store/auth.ts:32, 40-53`
- **Problem:** The subscription handle is discarded; Fast Refresh re-evaluates the module (resets the guard) and stacks duplicate listeners, each firing `refreshProfile()` on every auth event; also a process-lifetime leak.
- **Fix:** Keep the handle; unsubscribe before re-subscribing.
- **Fix prompt:** "In store/auth.ts, capture the { data:{ subscription } } from onAuthStateChange into a module-scope var and call subscription?.unsubscribe() at the top of bootstrap() before re-subscribing."

### CORE-5 — Settings hydration is a side effect of Mood bootstrap → theme flash / silent revert — Medium
- **Location:** `store/settings.ts:154`; `app/_layout.tsx:175-192`; `lib/moodBootstrap.ts:80-84`
- **Problem:** The root effect never calls `hydrateSettingsStore()` directly — it only happens because mood bootstrap awaits it. `ThemeProvider` reads `theme` at first paint → default-theme flash; if mood bootstrap is ever disabled, `theme`/`isPremium`/`isCouplePremium` silently stop persisting.
- **Fix:** Call `hydrateSettingsStore()` directly in the root effect.
- **Fix prompt:** "In app/_layout.tsx import hydrateSettingsStore and call `void hydrateSettingsStore();` in the root bootstrap useEffect (next to hydrateFavoritesStore()), independent of mood bootstrap."

### CORE-6 — `refreshProfile` swallows errors → new signups can get stuck on profile-setup — Medium
- **Location:** `store/auth.ts:88-100`; `app/(auth)/verify.tsx:97-110`
- **Problem:** The error branch is silently ignored; a transient profile fetch failure leaves `profile` null, and the verify gate then forces profile-setup (treating "fetch failed" as "profile incomplete").
- **Fix:** Log/surface the error, retry once, and only gate on a successful fetch.
- **Fix prompt:** "In store/auth.ts refreshProfile, console.error the error branch and add a one-time retry; in app/(auth)/verify.tsx only route to profile-setup when refreshProfile succeeded and display_name is genuinely null."

### CORE-7 — `getPhotoById` fabricates a picsum URL for unknown ids → broken favorites show random images — Medium
- **Location:** `constants/mockData.ts:356-372`
- **Problem:** Unknown ids match a generic regex and return `pic(id)` (random picsum), so a stale favorite id from an older catalog renders an unrelated stock image in preview/apply instead of a missing-asset state.
- **Fix:** Return `undefined` for unresolvable ids; render an "unavailable" state.
- **Fix prompt:** "In constants/mockData.ts getPhotoById, return undefined for ids not resolvable to a real catalog/featured asset (drop the pic(id) fallbacks), and update app/wallpaper/[id].tsx to render an 'unavailable' state instead of falling back to featured[0]."

### CORE-8 — Favorites/Settings hydration race can clobber persisted data — Low
- **Location:** `store/favorites.ts:41-51, 77-88`; `store/settings.ts:109-119, 148-151`
- **Problem:** Writes aren't gated on `hydrated`; a user action in the ~tens-of-ms window before `hydrate()` resolves can schedule a write of default/empty state that lands after hydrate, dropping persisted data.
- **Fix:** Defer mutations until `hydrated`, or merge in `hydrate()`.
- **Fix prompt:** "In store/favorites.ts and store/settings.ts, defer toggle/set/clear writes until get().hydrated is true (or merge persisted+in-memory in hydrate()), so an early user action can't clobber the persisted value when the async read lands after it."

---

## Appendix — verified NOT defects
- `as Href` casts (AI + couple screens): documented `typedRoutes` regen artifact, harmless at runtime.
- `lib/supabase.ts`: anon key via `EXPO_PUBLIC_*` is correct (publishable by design); fail-fast throw on missing env is intentional. No secret leak.
- Shuffle index parity JS ↔ native (`pickNextShuffleIndex`/`pickNextIndex`/`nextIndex`) — agrees for all 4 modes incl. `count<=1`.
- Single-active-mode coordinator re-entrancy guard (`automationMode.ts`) — correctly prevents A→B→A loops.
- `downloadToCache` content:// copy path (in-app) — deletes stale dest + throws real errors; solid.
- `useFetchWallpapers`, `verify.tsx` interval cleanup, `useMoodDetector` timer/AppState cleanup — leak-free.
- No circular imports found in the core/data layer.

## Notes
- This is static white-box analysis; items not marked ✅ tsc-confirmed should be reproduced at runtime before/after fixing.
- The 3 tsc-confirmed items (MOOD-1, MOOD-2, SHUF-5) plus the existing `lib/couple.ts:192` cast (COUPLE-8) are the only current `tsc --noEmit` errors in app code — fixing them clears the type check.
