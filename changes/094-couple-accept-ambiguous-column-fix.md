# 094 — Fix "column reference creator_id is ambiguous" on couple connect

**Date:** 2026-05-22
**Type:** fix

## Problem

Connecting a couple (the partner entering a LOVE-XXXX code) failed with the
Postgres error **`column reference "creator_id" is ambiguous`**. Login + the
new password auth (#093) work; this is purely the `accept_couple_code` RPC.

Confirmed live: the `create_couple` / `accept_couple_code` functions DO exist
in Supabase (a REST probe returned `NOT_AUTHENTICATED`, a `raise` from inside
the function, not "function not found"). So the schema is applied — the bug is
in the function body.

## Root cause

`accept_couple_code` is a `RETURNS TABLE (...)` function whose OUT columns are
named `creator_id`, `partner_id`, `status`, `code` — the same names as the
`public.couples` table columns. In PL/pgSQL those OUT names are in scope as
variables throughout the body. The "already linked?" guard ran:

```sql
select 1 from public.couples
where (creator_id = uid or partner_id = uid) and status <> 'unlinked' ...
```

with the columns **unqualified**, so each reference collided with the
identically-named OUT param. Postgres (default `variable_conflict = error`)
aborts on the first one → `creator_id` is ambiguous. `create_couple` is
unaffected because it returns plain `text` (no OUT columns to collide).

## Solution

Alias the subquery table (`public.couples cx`) and qualify every column
(`cx.creator_id`, `cx.partner_id`, `cx.status`, `cx.code`). The intent is now
explicit and there's no ambiguity. The fix is one `exists(...)` block; the rest
of the function (which already aliased its tables `c` / `cs` / `p`) was fine.

Fixed in both schema files. The **v2** file is the one that's deployed and
called (the app passes `p_role`, matching the 2-arg overload), so the v2
function must be re-run in Supabase. The v1 file had the identical latent bug
and was fixed too for hygiene.

## Files changed
- `supabase/couple_schema_v2_packs.sql` — `accept_couple_code`: aliased +
  qualified the ALREADY_LINKED `exists` subquery.
- `supabase/couple_schema.sql` — same fix in the v1 `accept_couple_code`.

## Verification

1. In the Supabase **SQL editor**, paste + run the corrected v2
   `accept_couple_code` (provided to the owner in chat; it's a
   `create or replace function`, safe to re-run).
2. In the app: Account A → Couple → generate a code. Account B → Couple →
   enter A's code → should link with **no error** and land on the dashboard.
3. Re-running accept on an already-linked code → "That code is already taken."
   A second active link on B → "You already have an active link." (the guard
   now actually runs instead of erroring on the ambiguity).

## Notes

- Editing the `.sql` file does NOT change the live database. The deployed
  function is only replaced when the corrected SQL is run in the Supabase SQL
  editor — that's the owner step in Verification.
- No app/JS change and no rebuild needed — the bug and fix are entirely in the
  database function. The installed APK already calls the RPC correctly.
- `couple_entitlement_enforcement.sql` only redefines `create_couple` and is a
  not-yet-applied template (subscriptions off) — untouched.
