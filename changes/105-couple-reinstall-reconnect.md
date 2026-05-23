# 105 — Couple: reinstalled phone reconnects to its existing pairing

## Problem

Owner reported (real two-phone test): **Xiaomi = host** (generated the code),
**Vivo = connected** (accepted it). After the Xiaomi was reinstalled (we wiped
its data to fix the `expo-task-manager` startup crash — see that session), the
Xiaomi could **not get back into its own couple**:

- Xiaomi showed **"Pair your couple"** (setup), not the dashboard.
- Pasting the **same code** on the Xiaomi returned **"already taken"**
  (`CODE_TAKEN`) — because the couple is still `linked` on the server, and
  `accept_couple_code` rejects accepting an already-linked couple.
- So the host had **no path back into its own pairing** without dropping the
  link and regenerating a code — exactly what the owner did not want.

### Root cause

A reinstalled device loses its in-memory `store/couple` link and must
**re-read** the pairing from Supabase on next login (`bootstrapCoupleFeature`
→ `fetchActiveCouple`). The old `fetchActiveCouple` did a **direct client
`select … from couples`** with an `.or(creator_id.eq…,partner_id.eq…)`
filter. On the host (creator) side that read was coming back **empty**, so the
restore silently produced "no couple" → setup screen. The pairing was never
lost on the server; the app just couldn't reliably read it back.

## Solution

Three redundant restore paths, keeping the GPS-distance proximity logic
**unchanged** (owner: "keep distance as-is"):

1. **DB — `supabase/couple_reconnect_v3.sql` (NEW):** a `get_my_couple()`
   `SECURITY DEFINER` RPC that returns the caller's active couple (host OR
   partner) + the other member's profile + the active pack id in one
   round-trip, scoped to `auth.uid()`. Runs regardless of RLS / PostgREST
   filter-shape quirks — the reliable restore primitive. Anon (no `auth.uid()`)
   gets nothing. Idempotent; paste into the Supabase SQL editor and Run.

2. **App — `lib/couple.ts`:**
   - `fetchActiveCouple()` now calls `get_my_couple()` first (via new
     `mapCoupleRow` helper); **falls back** to the original bare-row select if
     the RPC isn't deployed yet, so nothing regresses pre-migration.
   - `acceptCoupleCode()` is **reconnect-first**: before trying to "accept",
     it checks `fetchActiveCouple()`; if the entered code is the caller's own
     existing couple, it restores the link instead of hitting `CODE_TAKEN`.
   - NEW `restoreCouple()` — fetch the server pairing and push it into the
     store; returns the link (or null) for the UI.

3. **App — `app/couple/setup.tsx`:**
   - **Silent auto-restore on mount** — a reinstalled device rejoins with no
     code entry; the linked-status effect then routes to the dashboard. No
     toast, so it never nags.
   - Visible **"Already paired? Restore"** button (`onRestore`) that toasts the
     outcome and routes (linked → dashboard, pending → waiting room, none →
     "No active pairing found for this account").

## Files changed

- `supabase/couple_reconnect_v3.sql` — NEW. `get_my_couple()` RPC.
- `lib/couple.ts` — RPC-first `fetchActiveCouple` + `mapCoupleRow` +
  `restoreCouple` + reconnect-first `acceptCoupleCode`.
- `app/couple/setup.tsx` — auto-restore on mount + "Restore pairing" button.

## Deploy steps (REQUIRED — RPC must exist before the app benefits)

1. Supabase dashboard → SQL Editor → paste `supabase/couple_reconnect_v3.sql`
   → **Run**. (Idempotent; safe to re-run.)
2. Rebuild + reinstall the release APK on both phones (JS + a SQL dep; no
   native module change, but release embeds the JS bundle so a rebuild is
   needed to ship it).

## Verification

- Xiaomi (host) after reinstall + same-account login → opens to **dashboard**
  automatically (or "Already paired? Restore" → reconnected). No regenerate.
- Re-entering your own `LOVE-XXXX` no longer says "already taken" — it
  reconnects.
- New partner entering a fresh code → unchanged normal accept flow.
- `tsc` clean for changed files (pre-existing errors in `ai/preview.tsx` +
  two foreground modules are unrelated).

## Notes / caveats

- This fixes the case where the reinstalled device logs into the **same
  account** that owns the pairing. If the device signs into a *different*
  account, `get_my_couple()` correctly returns nothing — "Restore" then says
  "No active pairing found," which is the right signal (wrong account).
- Online/offline presence + auto-disconnect-when-host-offline (the "like a
  connected game" behaviour) is a SEPARATE, larger change and is **not** in
  this entry — this one only makes the pairing survive a reinstall.
