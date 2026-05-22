-- Kawaii Baby Wallpapers HD — Supabase schema.
-- Mirror of what you run in the Supabase SQL editor. Kept in the repo so the
-- DB shape is reviewable alongside app code. To apply: paste into a new
-- query in Supabase SQL editor and run. Idempotent-ish — re-running on a
-- fresh project is fine; on an existing one some statements will error
-- harmlessly (table already exists, etc).

-- ===========================================================================
-- profiles: 1 row per auth.users, keyed by the same uuid.
-- That uuid is the "primary key for each user" used everywhere in the app
-- (favorites, generations, couple pairing).
-- ===========================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  -- Key into the app's `constants/avatars.ts` catalog (e.g. 'bunny', 'star').
  -- Stored as a string id, not an image URL, so we can swap visuals without
  -- a DB migration. Nullable until the user completes the profile-setup form.
  avatar_id    text,
  invite_code  text unique not null,
  created_at   timestamptz not null default now()
);

-- For projects created before change #044: add the column idempotently.
alter table public.profiles add column if not exists avatar_id text;

-- Random 6-char invite code from an ambiguity-free alphabet (no 0/O/1/I).
create or replace function public.gen_invite_code()
returns text language plpgsql as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result   text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end $$;

-- Auto-create the profile row when a new auth user appears. Retries up to 5
-- times if the random code collides. `security definer` so the trigger can
-- write across the RLS boundary on behalf of the new user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_code text;
  attempt  int := 0;
begin
  loop
    attempt := attempt + 1;
    new_code := public.gen_invite_code();
    begin
      insert into public.profiles (id, email, invite_code)
      values (new.id, new.email, new_code);
      exit;
    exception when unique_violation then
      if attempt >= 5 then raise; end if;
    end;
  end loop;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- Row-level security: only the row's owner can read/write it.
-- Without these, the public anon key would grant read access to everyone's
-- profiles. With them, security holds even with the anon key bundled in the
-- mobile app.
-- ===========================================================================
alter table public.profiles enable row level security;

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);
