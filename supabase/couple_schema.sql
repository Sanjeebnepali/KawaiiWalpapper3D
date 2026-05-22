-- Kawaii Baby — Couple Proximity Wallpaper schema.
--
-- Mirrors the same paste-into-Supabase-SQL-editor convention as schema.sql.
-- Idempotent on a fresh OR existing project. Run AFTER schema.sql (this file
-- depends on the `profiles` table + `auth.users` trigger from that one).
--
-- Tables:
--   couples            — one row per linked pair. PK is the LOVE-XXXX code.
--   couple_locations   — latest GPS for each user inside a couple (2 rows max).
--   couple_settings    — shared per-couple knobs (active couple wallpaper id,
--                        proximity threshold, paused state).
--
-- RLS strategy: every couple row carries the `creator_id` + `partner_id` of
-- the two auth users. Every policy on the dependent tables checks that
-- `auth.uid()` is one of those two. The anon key cannot read anyone else's
-- pair, regardless of what is bundled in the mobile app.
--
-- Realtime: enable replication on `couple_locations` + `couple_settings`
-- so each phone gets <1 s push when the partner updates.

-- ===========================================================================
-- couples — the link itself.
-- ===========================================================================
create table if not exists public.couples (
  -- LOVE-XXXX where XXXX is from the ambiguity-free alphabet (no 0/O/1/I).
  -- Acts as the share code AND the natural primary key.
  code         text primary key,
  creator_id   uuid not null references auth.users(id) on delete cascade,
  -- Null while the couple is still in the "waiting for partner" state.
  partner_id   uuid     references auth.users(id) on delete set null,
  status       text not null default 'pending'
                 check (status in ('pending', 'linked', 'unlinked')),
  created_at   timestamptz not null default now(),
  linked_at    timestamptz,
  -- One active couple per user at a time on each side. Enforced via partial
  -- unique indexes below (Postgres can't express it inline because we want
  -- to allow many `unlinked` rows for history).
  constraint chk_distinct_partners
    check (partner_id is null or partner_id <> creator_id)
);

-- A user can be the CREATOR of at most one non-unlinked couple, AND the
-- PARTNER of at most one non-unlinked couple. Two indexes so the constraint
-- holds in both seats.
create unique index if not exists couples_one_active_per_creator
  on public.couples (creator_id) where status <> 'unlinked';
create unique index if not exists couples_one_active_per_partner
  on public.couples (partner_id) where status <> 'unlinked' and partner_id is not null;

-- ===========================================================================
-- couple_locations — latest position per user inside a couple.
-- ===========================================================================
create table if not exists public.couple_locations (
  couple_code text not null references public.couples(code) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  lat         double precision not null,
  lng         double precision not null,
  accuracy_m  double precision,
  updated_at  timestamptz not null default now(),
  primary key (couple_code, user_id)
);
create index if not exists couple_locations_couple_idx
  on public.couple_locations (couple_code);

-- ===========================================================================
-- couple_settings — shared per-couple state.
-- Either partner can write; the other gets the update via realtime.
-- ===========================================================================
create table if not exists public.couple_settings (
  couple_code             text primary key references public.couples(code) on delete cascade,
  -- Catalog id from `constants/mockData.ts` (e.g. 'couple-cute-3'). When
  -- proximity says "together" both phones apply this image as the wallpaper.
  -- Either partner can change it; the latest write wins (updated_by tracked
  -- so the UI can show "Your partner picked a new wallpaper" toast).
  couple_wallpaper_id     text,
  proximity_threshold_m   integer not null default 100,
  paused                  boolean not null default false,
  updated_by              uuid references auth.users(id) on delete set null,
  updated_at              timestamptz not null default now()
);

-- ===========================================================================
-- RPC: gen_couple_code() — random LOVE-XXXX from the same ambiguity-free
-- alphabet `gen_invite_code` uses. SECURITY DEFINER so it can run regardless
-- of RLS (it doesn't touch any table).
-- ===========================================================================
create or replace function public.gen_couple_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := 'LOVE-';
  i int;
begin
  for i in 1..4 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

-- ===========================================================================
-- RPC: create_couple()
-- Called by the subscriber side ("Person A"). Generates a fresh LOVE-XXXX,
-- retries on collision (up to 5 attempts), inserts the row with status =
-- 'pending', returns the code so the caller can show + share it.
-- Caller is identified via auth.uid(); the function refuses anon calls.
-- ===========================================================================
create or replace function public.create_couple()
returns text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_code text;
  attempt int := 0;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- One active couple per creator. If a pending or linked one already
  -- exists, just return THAT code instead of issuing a fresh one — this
  -- is the idempotent "show me my code again" path the Setup screen uses
  -- if the user re-opens it.
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
      insert into public.couples (code, creator_id, status)
      values (new_code, uid, 'pending');
      -- Create the matching settings row so realtime subscriptions on the
      -- partner side have something to subscribe to immediately.
      insert into public.couple_settings (couple_code)
      values (new_code);
      return new_code;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
end $$;

-- ===========================================================================
-- RPC: accept_couple_code(p_code)
-- Called by the partner side ("Person B"). Validates the code, sets
-- partner_id + status = 'linked' + linked_at = now(), returns the joined
-- couple row + the other user's profile so the dashboard can render
-- without a second round-trip.
--
-- Refuses to link if:
--   * code doesn't exist
--   * status is already 'linked' (taken) or 'unlinked' (revoked)
--   * the partner is the same user as the creator
--   * either user already has another non-unlinked couple in the other seat
-- ===========================================================================
create or replace function public.accept_couple_code(p_code text)
returns table (
  code            text,
  creator_id      uuid,
  partner_id      uuid,
  status          text,
  linked_at       timestamptz,
  creator_name    text,
  creator_avatar  text
) language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing public.couples%rowtype;
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
  -- The partner can't already have another active link. Alias + qualify so the
  -- column refs don't collide with this function's OUT params of the same name
  -- (creator_id / partner_id / status / code) — see v2 for the full note.
  if exists (
    select 1 from public.couples cx
    where (cx.creator_id = uid or cx.partner_id = uid)
      and cx.status <> 'unlinked'
      and cx.code <> p_code
  ) then
    raise exception 'ALREADY_LINKED';
  end if;

  update public.couples
    set partner_id = uid,
        status = 'linked',
        linked_at = now()
    where couples.code = p_code;

  return query
    select c.code, c.creator_id, c.partner_id, c.status, c.linked_at,
           p.display_name, p.avatar_id
      from public.couples c
      left join public.profiles p on p.id = c.creator_id
      where c.code = p_code;
end $$;

-- ===========================================================================
-- RPC: unlink_couple(p_code)
-- Either partner can unlink. Status flips to 'unlinked'; the row stays
-- (for history) but the partial unique indexes free up both seats to
-- create/accept fresh codes.
-- ===========================================================================
create or replace function public.unlink_couple(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.couples
    set status = 'unlinked'
    where code = p_code
      and (creator_id = uid or partner_id = uid)
      and status <> 'unlinked';
  if not found then
    raise exception 'NOT_YOUR_COUPLE';
  end if;
  -- Clear locations so a stale GPS pin doesn't follow a re-link.
  delete from public.couple_locations where couple_code = p_code;
end $$;

-- ===========================================================================
-- Row-level security.
-- Every couple-scoped table is locked to "auth.uid() is one of the two
-- members of the couple this row belongs to." The mobile anon key cannot
-- read anyone else's pair.
-- ===========================================================================
alter table public.couples           enable row level security;
alter table public.couple_locations  enable row level security;
alter table public.couple_settings   enable row level security;

-- ─── couples ───────────────────────────────────────────────────────────
-- Read your own couple (creator OR partner). Insert via RPC only — direct
-- inserts are blocked by the absence of an INSERT policy. Update only the
-- two columns the unlink flow needs.
drop policy if exists "couples: read own"   on public.couples;
drop policy if exists "couples: update own" on public.couples;

create policy "couples: read own"
  on public.couples for select
  using (auth.uid() = creator_id or auth.uid() = partner_id);

create policy "couples: update own"
  on public.couples for update
  using (auth.uid() = creator_id or auth.uid() = partner_id)
  -- COUPLE-2: Postgres validates the POST-update tuple only via WITH CHECK.
  -- Without it, a member could rewrite creator_id/partner_id to move the row
  -- to a couple they aren't in. Mirror the USING clause so the new row must
  -- still belong to the caller.
  with check (auth.uid() = creator_id or auth.uid() = partner_id);

-- ─── couple_locations ─────────────────────────────────────────────────
-- A user reads BOTH their own AND their partner's latest position; writes
-- only their own row. The "is this row part of my couple?" check joins
-- back to `couples`. Indexed on `couple_code` so the join is cheap.
drop policy if exists "couple_loc: read couple" on public.couple_locations;
drop policy if exists "couple_loc: write own"   on public.couple_locations;
drop policy if exists "couple_loc: update own"  on public.couple_locations;

create policy "couple_loc: read couple"
  on public.couple_locations for select
  using (
    exists (
      select 1 from public.couples c
      where c.code = couple_locations.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
        and c.status = 'linked'
    )
    -- COUPLE-1 (server-side defence-in-depth): when the couple is paused, no
    -- position is selectable by either side, regardless of client state. A
    -- partner whose app was killed (only the foreground-service keeps its
    -- location task firing) and whose realtime socket is down therefore
    -- cannot READ a position even if a stale row exists — pause is enforced
    -- at the database, not just on the wire. NOT EXISTS so a missing
    -- settings row (shouldn't happen — create_couple makes it) reads as
    -- "not paused" and stays selectable rather than locking everyone out.
    and not exists (
      select 1 from public.couple_settings s
      where s.couple_code = couple_locations.couple_code
        and s.paused = true
    )
  );

create policy "couple_loc: write own"
  on public.couple_locations for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.couples c
      where c.code = couple_locations.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
        and c.status = 'linked'
    )
  );

create policy "couple_loc: update own"
  on public.couple_locations for update
  using (auth.uid() = user_id)
  -- COUPLE-2: re-validate the post-update row. Without WITH CHECK a member
  -- could craft an .update() that rewrites user_id / couple_code to point at
  -- another couple. The check mirrors the insert policy: the new row must be
  -- the caller's own row inside a couple the caller belongs to.
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.couples c
      where c.code = couple_locations.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
        and c.status = 'linked'
    )
  );

-- ─── couple_settings ──────────────────────────────────────────────────
-- Both partners can read AND update the shared settings row (couple
-- wallpaper id, pause flag, threshold). The row itself is created by
-- `create_couple()` so no INSERT policy is needed.
drop policy if exists "couple_set: read couple"  on public.couple_settings;
drop policy if exists "couple_set: write couple" on public.couple_settings;

create policy "couple_set: read couple"
  on public.couple_settings for select
  using (
    exists (
      select 1 from public.couples c
      where c.code = couple_settings.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
    )
  );

create policy "couple_set: write couple"
  on public.couple_settings for update
  using (
    exists (
      select 1 from public.couples c
      where c.code = couple_settings.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
        and c.status = 'linked'
    )
  )
  -- COUPLE-2: validate the POST-update row too. Without WITH CHECK a member
  -- could rewrite couple_code to a couple they don't belong to. Mirror the
  -- USING predicate so the new row still references the caller's own couple.
  with check (
    exists (
      select 1 from public.couples c
      where c.code = couple_settings.couple_code
        and (c.creator_id = auth.uid() or c.partner_id = auth.uid())
        and c.status = 'linked'
    )
  );

-- ===========================================================================
-- Realtime: enable replication so each phone gets <1 s push when its
-- partner updates location or wallpaper. Idempotent — `add table` errors
-- harmlessly if the table is already in the publication.
-- ===========================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.couple_locations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.couple_settings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.couples;
  exception when duplicate_object then null;
  end;
end $$;
