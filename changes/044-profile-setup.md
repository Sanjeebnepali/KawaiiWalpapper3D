# 044 — Profile setup form (display name + avatar)

## Problem

After change #043 every signed-in user has an `auth.users.id` and an
auto-generated `profiles` row, but `display_name` was always `null` — the
Settings header showed "Kawaii User" as a placeholder for everyone, and the
couple feature (#045 upcoming) needs a real name to address people by.

User direction: simple name-collection form right after first OTP success.
Gender/relationship-type stays out of the signup flow — it'll be collected
during the couple-pairing flow in #045, where the system computes the couple
type from both partners' genders and filters wallpapers accordingly.

## Solution

Mandatory **profile-setup screen** between OTP verify and the home tab. One
text field (display name, 1–32 chars) + a 4×2 grid of curated kawaii avatars
(emoji-on-color tiles — no image assets). Tap Continue → writes both fields
to `public.profiles`, refreshes the in-memory profile cache, and lands the
user on whatever screen they were soft-gated from (or home).

Same screen doubles as **Edit profile** when launched from Settings' pencil
button (`isEdit=1` param) — back button allowed, fields pre-filled.

The profile-completion gate sits inside `verify.tsx`: after `verifyOtp`
succeeds, the screen awaits `refreshProfile()` and reads
`profile.display_name`. Null → routes to `profile-setup` forwarding the
soft-gate `returnTo`. Non-null → routes back to `returnTo` like before.
Returning users skip the form entirely.

Avatars are stored as a stable string id (e.g. `'bunny'`, `'star'`), not as
an image URL — `constants/avatars.ts` is the catalog. This means we can swap
the visuals for real kawaii illustrations later without a DB migration.

## Files changed

**New:**
- `app/(auth)/profile-setup.tsx` — dual-use signup/edit screen. Live preview
  circle at the top updates as the user taps tiles. `valid` requires
  trimmed-name length between 1 and 32. `onSave` does
  `supabase.from('profiles').update(...)` and then `refreshProfile()`.
- `constants/avatars.ts` — 8-entry `AVATARS` readonly catalog
  (bunny/star/cloud/heart/cherry/moon/cake/bow) + `DEFAULT_AVATAR_ID` +
  `getAvatar(id)` helper that defends against missing/unknown ids.

**Modified:**
- `store/auth.ts` — `Profile` type gains `avatar_id: string | null`;
  `refreshProfile` select list extended.
- `app/(auth)/verify.tsx` — post-verify, refresh profile inline and route to
  `profile-setup` when `display_name` is null. Forwards `returnTo`.
- `app/(tabs)/profile.tsx` — header pencil button now routes to
  `profile-setup` with `isEdit=1` (was a placeholder alert). Avatar circle
  shows the selected avatar emoji-on-color when `profile.avatar_id` is set;
  falls back to the person icon for anonymous users.
- `supabase/schema.sql` — `profiles` table now declares `avatar_id text`;
  added an `alter ... add column if not exists` for existing projects.

## Supabase-side migration (one-time)

Run this in **SQL Editor** to add the column to your existing `profiles`:

```sql
alter table public.profiles add column if not exists avatar_id text;
```

That's it — no new policies needed since the existing "update own profile"
RLS policy already covers the new column.

## Verification

- Fresh user (no `display_name` yet): sign in via OTP → forced to
  `profile-setup` → name + avatar saved → bounced to home / soft-gate target.
- Returning user (`display_name` already set): sign in via OTP → skips the
  form, goes straight to soft-gate target or home.
- Settings → tap pencil → `profile-setup` opens in edit mode with current
  values pre-filled, back arrow visible → save updates profile → bounces back
  to Settings → header shows new name + avatar.
- Selecting an avatar tile updates the preview circle live before save.
- `select id, display_name, avatar_id from public.profiles` in the Supabase
  SQL editor shows the saved values.

## Notes

- **Web compatibility unchanged.** No native modules added; runs in the same
  Expo Router tree on web when we get there (#048).
- **Edit-mode back button** routes back via `router.back()` so the user lands
  on Settings, not the home tab.
- **Avatar visuals are intentionally lightweight** (emoji on a colored circle).
  Real kawaii illustrations are a swap of `constants/avatars.ts` body — keep
  the `id`s stable so saved profiles don't break.
- **`display_name` length cap (32)** is enforced client-side only; a server
  CHECK constraint can be added once we standardize content-mod rules.
- **Out of scope:** gender / DOB / pronouns / bio. Gender lands in #045
  (couple pairing flow); the rest only if a feature actually needs them.
