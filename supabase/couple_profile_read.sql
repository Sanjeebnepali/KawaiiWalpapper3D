-- Kawaii Baby — let couple partners read each other's profile (display name +
-- avatar) so the dashboard shows the partner's real name instead of the
-- "your partner" fallback.
--
-- Why this is needed: the base profiles RLS is "read your OWN row only"
-- (auth.uid() = id). The couple dashboard needs to show the OTHER person's
-- display_name / avatar_id. This adds a SECOND select policy (policies are
-- OR'd) that grants read access to a profile ONLY when the caller is in a
-- non-unlinked couple with that person. Nothing else is exposed — not email,
-- and not anyone you aren't paired with.
--
-- Safe to run anytime (idempotent: drops first). No app rebuild needed — RLS
-- changes take effect immediately. Paste into the Supabase SQL editor → Run.

drop policy if exists "profiles: read couple partner" on public.profiles;

create policy "profiles: read couple partner"
  on public.profiles for select
  using (
    exists (
      select 1 from public.couples c
      where c.status <> 'unlinked'
        and (
          (c.creator_id = auth.uid() and c.partner_id = profiles.id)
          or (c.partner_id = auth.uid() and c.creator_id = profiles.id)
        )
    )
  );
