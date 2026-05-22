-- Kawaii Baby — Couple Proximity v2: role + pack model.
--
-- Additive migration on top of `supabase/couple_schema.sql`. Run AFTER
-- the v1 schema. Idempotent — every `add column` / `add constraint` /
-- `create or replace function` form is re-runnable on a non-fresh DB.
--
-- What changes vs v1:
--   * couples gains `creator_role` and `partner_role` ('a' | 'b').
--     Roles must differ when both are set.
--   * couple_settings gains `couple_pack_id` (id of a triptych pack
--     defined client-side in `constants/couplePacks.ts`). The legacy
--     `couple_wallpaper_id` column stays but is no longer read by the
--     JS — left in place so a future "free-pick" mode can re-use it
--     without another migration.
--   * `create_couple()` now accepts the creator's role + an optional
--     starting pack id. Existing single-arg callers from the v1 build
--     still work because both args have defaults.
--   * `accept_couple_code()` now accepts the partner's role (auto-
--     assigned if null) and refuses a role that collides with the
--     creator's. Returns the role columns too so the dashboard can
--     render the right label without a second round-trip.

-- ─── Columns ──────────────────────────────────────────────────────────
alter table public.couples
  add column if not exists creator_role text,
  add column if not exists partner_role text;

-- CHECK + CHECK-different constraints. Postgres doesn't have
-- `add constraint if not exists`, so we wrap in a DO block.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'couples_creator_role_check'
  ) then
    alter table public.couples
      add constraint couples_creator_role_check
      check (creator_role is null or creator_role in ('a','b'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'couples_partner_role_check'
  ) then
    alter table public.couples
      add constraint couples_partner_role_check
      check (partner_role is null or partner_role in ('a','b'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'couples_roles_differ_check'
  ) then
    alter table public.couples
      add constraint couples_roles_differ_check
      check (
        creator_role is null
        or partner_role is null
        or creator_role <> partner_role
      );
  end if;
end $$;

alter table public.couple_settings
  add column if not exists couple_pack_id text;

-- ─── RPC: create_couple(p_role, p_pack_id) ─────────────────────────────
-- Defaults preserve v1 callers — `select public.create_couple()` keeps
-- working and assigns role 'a' + null pack. New callers from the v2
-- build pass both args.
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

  -- Idempotent return: if the user has an existing pending/linked
  -- couple, return its code (and keep its existing role/pack untouched).
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

-- ─── RPC: accept_couple_code(p_code, p_role) ───────────────────────────
-- When p_role is null we auto-assign the role the creator didn't take.
-- When p_role is provided we validate it doesn't collide with the
-- creator's. Returns role columns so the partner's UI renders labels
-- without a second fetch.
create or replace function public.accept_couple_code(
  p_code text,
  p_role text default null
)
returns table (
  code            text,
  creator_id      uuid,
  partner_id      uuid,
  status          text,
  linked_at       timestamptz,
  creator_role    text,
  partner_role    text,
  couple_pack_id  text,
  creator_name    text,
  creator_avatar  text
) language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing public.couples%rowtype;
  assigned_role text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into existing from public.couples where couples.code = p_code limit 1;
  if not found then
    raise exception 'CODE_NOT_FOUND';
  end if;
  if existing.status = 'linked' then
    raise exception 'CODE_TAKEN';
  end if;
  if existing.status = 'unlinked' then
    raise exception 'CODE_REVOKED';
  end if;
  if existing.creator_id = uid then
    raise exception 'CANNOT_LINK_SELF';
  end if;
  -- Alias the table (cx) and qualify every column. This subquery sits inside
  -- a RETURNS TABLE function whose OUT columns are named creator_id /
  -- partner_id / status / code — identical to these table columns. Unqualified
  -- references collide with those OUT params and Postgres aborts with
  -- "column reference creator_id is ambiguous". Qualifying via the alias makes
  -- the intent explicit and removes the ambiguity.
  if exists (
    select 1 from public.couples cx
    where (cx.creator_id = uid or cx.partner_id = uid)
      and cx.status <> 'unlinked'
      and cx.code <> p_code
  ) then
    raise exception 'ALREADY_LINKED';
  end if;

  -- Resolve the partner's role.
  if p_role is null then
    assigned_role := case
      when existing.creator_role = 'a' then 'b'
      when existing.creator_role = 'b' then 'a'
      else 'b'  -- creator had no role (legacy row); default partner to 'b'
    end;
  else
    if p_role not in ('a','b') then
      raise exception 'BAD_ROLE';
    end if;
    if existing.creator_role is not null and p_role = existing.creator_role then
      raise exception 'ROLE_TAKEN';
    end if;
    assigned_role := p_role;
  end if;

  update public.couples
    set partner_id = uid,
        status = 'linked',
        linked_at = now(),
        partner_role = assigned_role
    where couples.code = p_code;

  return query
    select c.code, c.creator_id, c.partner_id, c.status, c.linked_at,
           c.creator_role, c.partner_role,
           cs.couple_pack_id,
           p.display_name, p.avatar_id
      from public.couples c
      left join public.profiles p on p.id = c.creator_id
      left join public.couple_settings cs on cs.couple_code = c.code
      where c.code = p_code;
end $$;
