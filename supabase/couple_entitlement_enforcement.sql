-- Kawaii Baby — Couple Premium server-side entitlement enforcement (COUPLE-7).
--
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  ⚠  APPLY ONLY WHEN SUBSCRIPTIONS GO LIVE — DO NOT RUN THIS NOW.          │
-- │                                                                           │
-- │  This migration adds a SERVER-SIDE entitlement gate to create_couple().  │
-- │  While `constants/billing.ts` SUBSCRIPTIONS_ENABLED is false (the        │
-- │  current testing default), the paywall is intentionally fully open and   │
-- │  NOBODY has a `couple_premium` entitlement row yet. Running this file     │
-- │  now would make every create_couple() call raise 'NOT_ENTITLED' and      │
-- │  block all couple testing.                                                │
-- │                                                                           │
-- │  Ship sequence when subscriptions go live:                                │
-- │    1. Stand up the billing webhook that writes `public.entitlements`      │
-- │       rows (couple_premium = true) on a successful purchase / restore.    │
-- │    2. Backfill entitlements for any existing paid users.                  │
-- │    3. Flip constants/billing.ts SUBSCRIPTIONS_ENABLED → true.             │
-- │    4. THEN paste THIS file into the Supabase SQL editor and run it.       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Why this exists: today the Couple-Premium gate is JS-only
-- (`lib/billing.ts` → `lib/couple.ts:createCoupleCode`). The
-- `create_couple()` RPC enforces nothing, so anyone with the anon key could
-- call it directly and bypass the paywall. The JS gate stays as UX; this
-- makes the server the source of truth.
--
-- This is a TEMPLATE. It is NOT applied by `couple_schema.sql` /
-- `couple_schema_v2_packs.sql`, and the working create_couple RPC in those
-- files is left untouched on purpose so testing keeps working until launch.

-- ===========================================================================
-- entitlements — one row per user, the server-trusted source of paid perks.
-- Written by the billing webhook (service-role), never by the client.
-- ===========================================================================
create table if not exists public.entitlements (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  couple_premium boolean not null default false,
  -- Room to grow: add other perks (e.g. ai_unlimited) as more columns.
  updated_at     timestamptz not null default now()
);

alter table public.entitlements enable row level security;

-- Users may READ their own entitlement (so the app can reflect server truth);
-- nobody may write it through the anon/auth key — only the service-role
-- billing webhook (which bypasses RLS) inserts/updates rows. The absence of
-- any INSERT/UPDATE policy blocks client writes.
drop policy if exists "entitlements: read own" on public.entitlements;
create policy "entitlements: read own"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- ===========================================================================
-- RPC: create_couple(p_role, p_pack_id) — entitlement-enforcing variant.
--
-- IDENTICAL to the v2 create_couple() in couple_schema_v2_packs.sql EXCEPT
-- for the single NOT_ENTITLED guard marked below. When subscriptions are
-- live, applying this `create or replace` swaps the open RPC for the gated
-- one. `lib/couple.ts` already translates 'NOT_ENTITLED' is not in the
-- translate table — add a mapping there if you want a friendlier toast
-- (e.g. "Couple Premium required."); the raw message is shown otherwise.
-- ===========================================================================
create or replace function public.create_couple(
  p_role text default 'a',
  p_pack_id text default null
)
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_code text;
  attempt int := 0;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_role not in ('a','b') then
    raise exception 'BAD_ROLE';
  end if;

  -- ── COUPLE-7 server-side gate (the ONLY addition vs the v2 RPC) ──────────
  -- Refuse to create a couple unless the caller holds couple_premium. This
  -- closes the "call the RPC directly with the anon key" bypass — the JS
  -- gate in lib/couple.ts is now UX only.
  if not exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.couple_premium = true
  ) then
    raise exception 'NOT_ENTITLED';
  end if;
  -- ─────────────────────────────────────────────────────────────────────────

  -- Idempotent return: if the user has an existing pending/linked couple,
  -- return its code (and keep its existing role/pack untouched).
  select code into new_code
    from public.couples
    where creator_id = uid and status <> 'unlinked'
    limit 1;
  if new_code is not null then
    return new_code;
  end if;

  loop
    attempt := attempt + 1;
    new_code := public.gen_couple_code();
    begin
      insert into public.couples (code, creator_id, status, creator_role)
      values (new_code, uid, 'pending', p_role);
      insert into public.couple_settings (couple_code, couple_pack_id)
      values (new_code, p_pack_id);
      return new_code;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
end $$;

-- Optional: enforce on accept too, so a non-paying partner can't link into a
-- premium couple. Per the product spec the partner INHERITS premium on accept
-- (see lib/couple.ts acceptCoupleCode), so this is intentionally NOT gated —
-- only the CREATOR must be entitled. Documented here so it's a deliberate
-- choice, not an oversight.
