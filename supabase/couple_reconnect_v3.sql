-- Kawaii Baby — Couple Proximity v3: reliable reconnect after reinstall.
--
-- Additive migration on top of couple_schema.sql + couple_schema_v2_packs.sql.
-- Idempotent — re-runnable on an existing project. Paste into the Supabase
-- SQL editor and Run. Safe to run more than once.
--
-- WHY (changes/105):
--   When a phone is reinstalled it loses its local copy of the couple link.
--   The app then has to RE-READ the pairing from the server on next login.
--   The previous path did a direct `select … from couples` from the client,
--   which depends on PostgREST + RLS resolving the `.or(creator,partner)`
--   filter exactly right; on the HOST (creator) side that read was coming
--   back empty, so a reinstalled host saw "Pair your couple" and could not
--   rejoin its OWN couple (re-entering the code returned "already taken"
--   because the couple is still 'linked').
--
--   This RPC runs SECURITY DEFINER, so it returns the caller's active couple
--   regardless of RLS / query-shape quirks — one stable round-trip the client
--   can trust. It returns BOTH the couple row AND the OTHER member's profile
--   + the active pack id so the dashboard renders without extra fetches.
--
--   `auth.uid()` still scopes it to the caller — a user can only ever read a
--   couple they are a member of. The anon key (no auth.uid()) gets nothing.

create or replace function public.get_my_couple()
returns table (
  code            text,
  creator_id      uuid,
  partner_id      uuid,
  status          text,
  linked_at       timestamptz,
  creator_role    text,
  partner_role    text,
  couple_pack_id  text,
  -- The member who is NOT the caller (the partner, from the caller's POV).
  -- Null while the couple is still pending (no partner yet).
  other_id        uuid,
  other_name      text,
  other_avatar    text
) language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;  -- no rows for an unauthenticated caller
  end if;

  return query
    select
      c.code,
      c.creator_id,
      c.partner_id,
      c.status,
      c.linked_at,
      c.creator_role,
      c.partner_role,
      cs.couple_pack_id,
      pr.id,
      pr.display_name,
      pr.avatar_id
    from public.couples c
    left join public.couple_settings cs on cs.couple_code = c.code
    -- Resolve the OTHER member relative to the caller so the host gets the
    -- partner's profile and the partner gets the host's.
    left join public.profiles pr
      on pr.id = (case when c.creator_id = uid then c.partner_id else c.creator_id end)
    where (c.creator_id = uid or c.partner_id = uid)
      and c.status <> 'unlinked'
    -- A user can be in at most one non-unlinked couple per seat, but they
    -- could in theory hold one as creator AND one as partner. Prefer the most
    -- recently linked, then the most recently created, and only ever return 1.
    order by c.linked_at desc nulls last, c.created_at desc
    limit 1;
end $$;

-- Authenticated users only. (anon has no auth.uid() so it returns nothing
-- anyway, but we don't grant it execute.)
grant execute on function public.get_my_couple() to authenticated;
