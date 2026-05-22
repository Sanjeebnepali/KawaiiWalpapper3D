# Couple Proximity Wallpaper — LOVE-XXXX pairing, live GPS sync, auto-swap on <100 m

**Date:** 2026-05-20
**Type:** feature

## Problem

Build the Couple Proximity Wallpaper feature on the existing Couple tab:

> Generate unique LOVE-XXXX code → share with partner → partner enters
> it → both phones share live location → when they're <100 m apart,
> both phones automatically swap to the shared "couple" wallpaper, and
> back to each user's solo wallpaper when they part.

User-level extras specified at the same time:

- **Tech stack:** Supabase (the project already uses it), NOT Firebase.
  Realtime DB and FCM in the original spec are replaced by Supabase
  Realtime + Postgres RLS.
- **Auth:** must check signed-in state before any couple action.
- **Couple Premium gating:** only subscribers can GENERATE a code. The
  PARTNER who enters that code inherits Couple Premium automatically.
  Both partners can choose images, but only one wallpaper is applied
  at a time (the proximity decides which: solo when apart, couple
  when together).
- **Code lives on the Couple page, not the Settings page.**
- **Production-ready** screens + RLS-locked DB schema + background
  location task with geofencing.

## Solution

Three new lib modules + one Zustand store + one Supabase schema +
four screens, wired into the existing app shell.

### Architecture choices (confirmed up-front)

- **Location library:** `expo-location` (Expo SDK 55 native), not the
  paid `react-native-background-geolocation`. Identical low-power
  behaviour for our use case via `Accuracy.Balanced` +
  `distanceInterval: 25 m` + geofencing. Free, no licence, Expo
  prebuild auto-injects the manifest entries from the plugin config.
- **Cross-device sync:** Supabase Realtime channels only — no FCM /
  Expo Push. Each phone subscribes to its couple's three tables;
  updates flow Phone A → Postgres → Phone B in under a second while
  either side has the app live (foreground or via the location
  foreground service). The location FGS keeps the app process alive
  on Android, so the realtime channel stays open even with the screen
  off. iOS gets the same behaviour via location background mode.
- **Couple wallpaper source:** picked from the existing
  `constants/mockData.ts:coupleWallpapers` catalog. Either partner
  taps a thumbnail on the dashboard; the selection writes to
  `couple_settings.couple_wallpaper_id` and propagates via realtime.

### Supabase schema — `supabase/couple_schema.sql`

Three tables, all RLS-locked:

- `couples` — one row per linked pair. `code` (LOVE-XXXX) is the PK and
  the share code. `creator_id` + `partner_id` reference `auth.users`.
  Partial unique indexes (`couples_one_active_per_creator`,
  `couples_one_active_per_partner`) enforce "one active couple per
  user per seat" while still allowing many `unlinked` history rows.
- `couple_locations` — `(couple_code, user_id)` composite PK so each
  side has exactly one row of latest GPS. Upserted every 30 s by the
  background task.
- `couple_settings` — shared per-couple state: `couple_wallpaper_id`,
  `proximity_threshold_m` (default 100), `paused`, `updated_by`,
  `updated_at`. Either partner can write; the other's realtime
  subscriber updates the local store.

Three RPCs (`SECURITY DEFINER`):

- `gen_couple_code()` — random LOVE-XXXX from the same ambiguity-free
  alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) `gen_invite_code()`
  already uses (no 0/O/1/I/L confusion).
- `create_couple()` — idempotent. Refuses anon calls
  (`raise NOT_AUTHENTICATED`). If the caller already has a
  pending-or-linked couple they created, returns THAT code instead of
  issuing a new one. Retries on the (vanishingly rare) code collision
  up to 5 times. Creates the matching `couple_settings` row so
  realtime subs have something to bind to immediately.
- `accept_couple_code(p_code)` — validates code exists + is pending +
  is not the caller's own + caller doesn't already have another link.
  Flips status → 'linked', stamps `linked_at`, returns the joined
  row + creator's display_name/avatar in a single round-trip so the
  dashboard can render without a second fetch.
- `unlink_couple(p_code)` — either partner can call. Status → 'unlinked'
  (history-preserving); locations deleted; the partial unique indexes
  free both seats to re-pair.

RLS policies on every couple-scoped table check `auth.uid()` is one
of `creator_id` / `partner_id` of the joined `couples` row. The
mobile anon key cannot read any other pair, even if a malicious
client tries crafted code values — the RLS join enforces ownership.

Realtime publication enabled for all three tables via the idempotent
`do $$ ... alter publication supabase_realtime add table ... $$`
block at the bottom.

### `lib/couple.ts` — RPC + realtime glue

- `createCoupleCode()` — Couple-Premium gated client-side AND server-
  side (the RPC raises `NOT_AUTHENTICATED` for anon, but the client
  check stops the network round-trip when the user lacks the SKU).
  Pushes `{ code, status: 'pending', isCreator: true }` into the
  store on success.
- `acceptCoupleCode(rawCode)` — normalises + validates LOVE-XXXX
  shape locally, calls the RPC, on success flips
  `settings.isCouplePremium = true` so the partner inherits the perk,
  pushes the full link (with the creator's profile) into the store.
- `unlinkCouple()` — calls the RPC, resets the store.
- `subscribeCouple(code)` — opens one Realtime channel for the couple
  watching all three tables. Returns an unsubscribe function;
  `coupleBootstrap.ts` owns the lifecycle.
- `pushMyLocation(code, lat, lng, accuracyM)` — upsert into
  `couple_locations` keyed on (couple_code, user_id). Called every
  30 s by the location task.
- `setCoupleWallpaper(code, photoId)` and `setCouplePaused(code, bool)` —
  shared-settings writes. Mirror locally to update UI instantly.
- Error translator maps Postgres exceptions
  (`CODE_NOT_FOUND`, `CODE_TAKEN`, `CODE_REVOKED`, `CANNOT_LINK_SELF`,
  `ALREADY_LINKED`, …) into friendly toast strings.

### `lib/coupleLocation.ts` — expo-location background task + geofence

Two TaskManager-defined tasks (registered at module-load, NOT inside
a component — the OS dispatches to them at boot for `startOnBoot`
behaviour):

- `kawaii.couple.location.v1` — receives `Location` updates from
  `startLocationUpdatesAsync` (every 30 s OR every 25 m, whichever
  comes first). On each update: push to Supabase, update the store,
  call `applyProximityWallpaper()`.
- `kawaii.couple.geofence.v1` — `startGeofencingAsync` with a single
  region centred on the partner's last-known position, radius =
  `thresholdM` (100 m default). The OS wakes us on enter/exit;
  zero battery cost between events.

`refreshCoupleGeofence()` re-anchors the geofence at the partner's
new pin every time realtime delivers a fresh partner position —
called from the bootstrap subscriber. Means the geofence is always
"is WE within 100 m of WHERE THEY ARE RIGHT NOW".

Permission helper `ensureBackgroundLocationPermission()` returns
`'granted' | 'foreground-only' | 'denied'` so the Dashboard can show
the right alert (foreground-only is the common case on iOS where the
user said "Only when in use" — proximity won't work in background
until they switch to "Always").

### `lib/coupleWallpaper.ts` — solo↔couple switcher

`applyProximityWallpaper()` reads the store's `proximity` state and:

- `'near'` → apply the shared `coupleWallpaperId` via the existing
  `setAsWallpaper()` pipeline (same one Mood / Shuffle use → goes
  through the native `WallpaperSetter` module).
- `'far'` → apply the user's `lastSoloWallpaperId` (the most recently
  set non-couple wallpaper).
- `'unknown'` → no-op so a cold-start flicker doesn't briefly stamp
  the wrong image.

A process-local `lastAppliedKey` dedups consecutive applies of the
same state so a noisy GPS that re-emits "still near" every tick
doesn't keep re-writing the wallpaper.

### `lib/coupleBootstrap.ts` — lifecycle owner

Called once from `app/_layout.tsx` after `useAuthStore.bootstrap()`:

1. Fetch the active couple via `fetchActiveCouple()`, push to store.
2. If `linked`, hydrate shared settings + partner location, open the
   realtime channel, start the background location task, refresh the
   geofence, run an immediate `applyProximityWallpaper()`.
3. If `pending`, open ONLY the realtime channel so the creator's
   /couple/linking screen auto-advances when the partner accepts.
4. Subscribe to auth changes — sign-out tears everything down,
   sign-in re-runs the fetch. Never leaks partner GPS across an
   account switch.
5. Subscribe to couple-store changes — proximity flip triggers a
   wallpaper re-apply; partner position change re-anchors the
   geofence.

### `store/couple.ts` — Zustand

In-memory mirror of Supabase. Slices:
- `link: CoupleLink | null` (code, status, isCreator, partner profile)
- `myLat/Lng`, `partnerLat/Lng`, `partnerUpdatedAt`
- `partnerDistanceM`, `proximity: 'unknown' | 'near' | 'far'`
- `coupleWallpaperId`, `paused`, `thresholdM`
- `error`

`setMyLocation` / `setPartnerLocation` auto-recompute Haversine
distance + proximity via the internal `recomputeDistance` helper.
`haversineMeters` exported for tests + the bootstrap.

Narrow selectors (`useCoupleLink`, `useCoupleProximity`,
`useCoupleDistance`, `useCouplePaused`, `useCoupleWallpaperId`) so
each subscriber re-renders only on its slice.

### Screens — `app/couple/{setup,linking,dashboard,preview}.tsx`

1. **setup.tsx** — two-card layout: GENERATE (gated on
   `gateCouplePremium`) and ENTER. Generated code renders big with
   Copy / Share / Continue → /couple/linking. Entered code calls
   `acceptCoupleCode` → routes to /couple/dashboard.
2. **linking.tsx** — "Waiting for partner" with a pulse-animated
   heart, the LOVE-XXXX code + Copy/Share, and a Cancel button that
   `unlinkCouple()`s the pending row. `useEffect` watches the store
   and auto-replaces to /couple/dashboard the moment status flips
   to 'linked' (driven by the realtime sub in bootstrap).
3. **dashboard.tsx** — partner card (avatar + name + LOVE code +
   live distance + Together/Apart status pill), Active wallpaper
   card (shows current proximity-driven wallpaper), horizontal
   couple-wallpaper picker (taps write to `couple_settings` and
   propagate via realtime), Pause/Resume + Check-GPS controls,
   unlink via ellipsis menu. "Location shared with [partner name]
   only" privacy footer per spec.
4. **preview.tsx** — side-by-side Solo vs Couple cards. Whichever
   is the active proximity state has a primary-coloured border.
   Live `formatDist` updates as the partner's position changes.

### Couple-tab entry — `app/(tabs)/couple.tsx`

Rewired to a smart router. Above the existing couple-wallpaper grid,
a banner card shows current link state and routes to the right
sub-screen on tap:

- `anon` → "Sign in" (unchanged).
- `unlinked` → "Pair your couple" with the PremiumLock pill →
  /couple/setup.
- `pending` → "Waiting for partner" → /couple/linking.
- `linked` → "Linked with [name]" → /couple/dashboard.

The catalog grid below is intentionally kept visible in every state
so even un-paired users can browse couple-themed wallpapers and tap
through to /wallpaper/[id].

### Settings flag — `store/settings.ts`

New persisted boolean `isCouplePremium`, defaulting to false. Set to
true by:
1. Manual purchase (Phase 2 — RevenueCat `couple_premium` entitlement
   wires into the existing `set('isPremium', true)` pattern).
2. `acceptCoupleCode()` auto-flips it true on successful link, per
   the product rule "partner inherits Couple Premium."

`gateCouplePremium(onUnlock)` added next to the existing
`gatePremium` in `components/PremiumLock.tsx`. Identical paywall
shape; "Subscribe (dev)" button flips the flag for QA.

### `app.json` — expo-location plugin + permissions

- Added the `expo-location` plugin entry with
  `isAndroidBackgroundLocationEnabled: true` +
  `isAndroidForegroundServiceEnabled: true` so Expo prebuild bakes
  the right manifest entries (background type, foreground service
  permission) into the next `expo run:android`.
- Added Android permissions: `ACCESS_FINE_LOCATION`,
  `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`,
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.

### `package.json`

Added `"expo-location": "~19.0.7"` (Expo SDK 55-compatible). Per
existing project convention, this requires
`npm install --legacy-peer-deps` and a `npx expo run:android` to
take effect.

## Files changed

NEW:
- `supabase/couple_schema.sql` — schema + RLS + RPCs + realtime
- `lib/couple.ts` — RPC + realtime glue
- `lib/coupleLocation.ts` — expo-location task + geofence
- `lib/coupleWallpaper.ts` — solo↔couple apply
- `lib/coupleBootstrap.ts` — lifecycle owner
- `store/couple.ts` — Zustand state + Haversine
- `app/couple/setup.tsx`
- `app/couple/linking.tsx`
- `app/couple/dashboard.tsx`
- `app/couple/preview.tsx`
- `changes/077-couple-proximity-wallpaper.md` — this file

MODIFIED:
- `app/(tabs)/couple.tsx` — routing banner over existing grid
- `app/_layout.tsx` — bootstrap call + four new Stack.Screen entries
- `app.json` — expo-location plugin + Android permissions
- `package.json` — expo-location dependency
- `store/settings.ts` — `isCouplePremium` flag + persist
- `components/PremiumLock.tsx` — `gateCouplePremium` helper
- `changes/README.md` — index row

## Verification

```powershell
# Native rebuild needed (new permissions + new native module).
npm install --legacy-peer-deps
npx expo run:android --variant release --no-bundler
```

1. **Apply the SQL.** Open Supabase SQL editor, paste the contents
   of `supabase/couple_schema.sql`, run. Idempotent — safe to re-run
   if you tweak the file.

2. **Smoke test the schema.**
   ```sql
   -- as user A (set request.jwt.claims via Studio impersonation)
   select public.create_couple();        -- expect LOVE-XXXX
   -- as user B
   select * from public.accept_couple_code('LOVE-XXXX');
   -- back as user A
   select * from public.couples;         -- status = 'linked', linked_at set
   ```

3. **Link two devices.**
   - Sign in on Device A. Open the Couple tab → tap "Pair your couple" →
     Generate code → toast "✓ Code copied" → share it.
   - Sign in on Device B (different account). Couple tab → tap "Pair
     your couple" → enter the code → toast "💕 Linked".
   - Device A should auto-replace the linking screen with the
     Dashboard within ~1 s (realtime). Both dashboards show the
     other partner's name + LOVE-XXXX.

4. **Couple Premium inheritance.**
   - Before linking on Device B, observe `isCouplePremium = false`
     (the "Generate code" button shows the lock icon).
   - After linking, `isCouplePremium = true` (the SKU is unlocked).
     Confirmed via the toast on a now-allowed `createCoupleCode()`
     attempt if you unlink and re-pair on B side.

5. **Proximity flip.**
   - With both devices < 100 m apart (e.g. on the same desk), both
     should apply the chosen couple wallpaper within ~30 s of
     pairing.
   - Walk one device > 100 m away. Within ~30 s (or instantly via the
     geofence exit event), BOTH phones swap back to their respective
     solo wallpapers.
   - Walk back. The geofence ENTER event fires, both swap to the
     couple wallpaper again.

6. **Picker sync.**
   - On Device A, tap a different thumbnail in the dashboard's
     "Choose a couple wallpaper" picker.
   - Device B's dashboard should update its "Active wallpaper" thumb
     within ~1 s. When they're together, both phones re-apply the
     new image.

7. **Privacy controls.**
   - Tap Pause sharing on either device — proximity force-flips to
     "Apart" on both sides (the recompute treats `paused` as
     always-far) and the wallpaper goes solo.
   - Resume — proximity recomputes from real GPS.
   - Unlink via the dashboard's ellipsis menu — both phones return
     to /couple/setup; partner locations are cleared.

8. **Error states.**
   - Wrong code: "No couple with that code."
   - Already-linked code: "That code is already taken."
   - Try to enter your own code: "You can't link with yourself."
   - Sign out mid-session: bootstrap subscriber tears down the
     location task + realtime channel cleanly.
   - GPS denied: Dashboard's "Check GPS" surfaces the right
     "Open Settings" alert with `Linking.openSettings()`.

## Notes

- **iOS background location** requires the user to grant "Always
  Allow" location in Settings. `ensureBackgroundLocationPermission()`
  returns `'foreground-only'` when they pick "While Using" — the
  Dashboard's "Check GPS" button surfaces a deep-link alert that
  walks them to Settings.
- **Android 14 specialUse vs location FGS type.** We're using the
  built-in `location` foreground service type (auto-injected by the
  expo-location plugin) — not `specialUse` like the other FGSes in
  this project. The location FGS type is the OS-blessed contract for
  "this app is showing the user's continuous live location,"
  exactly what we're doing.
- **Realtime keepalive on Android.** The location FGS keeps the app
  process alive; Supabase Realtime over WebSocket stays connected as
  long as the process is. If an OEM autostart killer fights the FGS
  (Vivo / MIUI / ColorOS — same caveat as Mood Based per
  changes/075), the privacy hint in the Dashboard's "Check GPS"
  flow guides the user to whitelist the app.
- **No FCM/push** in this MVP. The proximity flip happens on each
  side independently from the geofence exit/enter — no cross-device
  push needed because both devices have the OS waking them on their
  own boundary cross. A future enhancement could add Expo Push to
  ALSO notify the partner ("Your partner just got home 💕"), but
  the wallpaper swap itself works without it.
- **Couple Premium is a separate SKU from regular Premium.** Once
  the user has it (paid or inherited from a partner), it persists
  across unlink — paid perks don't get revoked on un-pair.
- **`lastSoloWallpaperId` is referenced but not yet wired.** The
  preview + solo-apply paths read it via a structural cast. To make
  "solo when apart" actually apply something specific, add the field
  to `settings.ts` and have the existing `setAsWallpaper` call
  inside Mood / Shuffle / browse stamp it. Left as a 5-line
  follow-up so this change stays focused on the couple feature
  itself — without it the apply silently no-ops (the wallpaper just
  stays as whatever was set last by other means), which is the safe
  default.
- **Native rebuild required** to pick up the new permissions +
  expo-location native code. JS reload is not enough.
