# 043 — Supabase auth + per-user invite code (Phase 1)

## Problem

Up to this point every screen ran against mock data with no concept of a user.
Two upcoming features need a real user identity:

1. **Couple Theme** — needs a stable id per user so two accounts can pair and
   share a wallpaper set.
2. **AI Generator** — needs a user id to enforce the daily quota (the
   `maxGenPerDay` slider in Settings is currently dead UI).

Plus general "saved favorites should follow me to a new device" — currently
the favorites store is in-memory only.

## Solution

Add Supabase auth with **email + 6-digit OTP** (no passwords). User identity
is the Supabase `auth.users.id` (uuid). A `public.profiles` row is auto-created
on first sign-in via DB trigger, carrying a unique 6-character `invite_code`
that Phase 2 will use for couple pairing.

Auth is a **soft gate**: anonymous users can still browse home/category/search/
mood/sleep-wake. They get prompted to sign in only when they tap into Couple
Theme, AI Generate, or the favorite heart toggle.

Session persists across app launches via Supabase's `AsyncStorage` adapter.
`react-native-url-polyfill` patches `URL` so `@supabase/supabase-js`'s
fetch implementation works in the RN runtime.

## Files changed

**New:**
- `lib/supabase.ts` — client. Reads `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `.env`. `detectSessionInUrl: false` because we're on OTP, not magic-link URLs.
- `store/auth.ts` — Zustand store. `bootstrap()` reads the persisted session and subscribes to `onAuthStateChange`. Idempotent via module-scoped guard. `sendOtp` / `verifyOtp` / `signOut` / `refreshProfile` actions.
- `app/(auth)/_layout.tsx` — headerless Stack.
- `app/(auth)/login.tsx` — email entry → `sendOtp` → push `verify`. Forwards `returnTo` so a successful sign-in via `useRequireAuth` returns the user to the screen they tried to use.
- `app/(auth)/verify.tsx` — 6-digit numeric input → `verifyOtp` → `router.replace(returnTo)` or `router.back()`. Resend button.
- `hooks/useRequireAuth.ts` — `{ user, isAuthed, requireAuth }`. `requireAuth(action, opts?)` runs the action immediately if signed in; otherwise shows a `premiumAlert` with title/message overrides and routes to `/(auth)/login`.
- `supabase/schema.sql` — mirror of the SQL run in Supabase Studio (profiles table, `gen_invite_code()`, `handle_new_user()` trigger, RLS policies).
- `.env` (gitignored) / `.env.example` — credential plumbing.

**Modified:**
- `app/_layout.tsx` — registers the `(auth)` route group with the root Stack; calls `useAuthStore.getState().bootstrap()` once in `useEffect`.
- `app/(tabs)/profile.tsx` — header now shows real `user.email`. Adds a "Couple Pairing" section with the user's invite code (tap to copy). Logout button calls `signOut`; when anonymous, becomes a "Sign in" button instead.
- `app/(tabs)/couple.tsx` — anonymous users see a locked overlay with a Sign-in CTA instead of the grid.
- `app/(tabs)/ai.tsx` — Generate button routes through `requireAuth` (prompt UI is still browsable for anon users).
- `components/WallpaperGridCell.tsx` — heart toggle routes through `requireAuth`. No visual change for signed-in users.
- `package.json` — added `@supabase/supabase-js`, `react-native-url-polyfill`.

## Supabase-side setup (one-time, done in dashboard)

1. **Authentication → Providers → Email**: enabled, "Confirm email" ON.
2. **Authentication → Email Templates**: both **Magic Link** and **Confirm signup** templates updated to include `{{ .Token }}` so the 6-digit code is visible in the email body.
3. **Authentication → URL Configuration**: Site URL `kawaii://`, redirect `kawaii://**`.
4. **SQL Editor**: ran `supabase/schema.sql` (creates `profiles`, `gen_invite_code`, `handle_new_user` trigger, RLS).

## Verification

- `npm install --legacy-peer-deps` clean (per the project's pinned-deps rule).
- App boots without errors; auth store rehydrates session if previously signed in.
- Anonymous tap on Couple tab → locked overlay → Sign in → email entry → OTP code from inbox → returned to Couple tab as signed-in user.
- Anonymous tap on heart in any wallpaper grid → premium alert → Sign in flow.
- After sign-in, `profile.invite_code` is a 6-char string visible in the Settings → Couple Pairing row; tapping copies to clipboard.
- `select id, email, invite_code from public.profiles` in Supabase SQL editor confirms the trigger inserted the row.
- Logout from Settings clears session; subsequent tap on gated feature re-prompts sign-in.

## Notes

- **Why AsyncStorage, not SecureStore.** AsyncStorage is already a project dep; adding SecureStore would force a native rebuild for marginal security gain (refresh token would still be exfiltratable from a rooted device either way). Documented as a hardening follow-up.
- **Out of scope (Phase 2):** the actual pairing UI. The invite code is generated and surfaced; what's missing is the "enter your partner's code" flow that creates a `couples` row joining two `auth.users.id`s, plus the RPC + RLS to expose partner content. That ships as change #044.
- **TODO once Phase 2 lands:** swap the `coupleWallpapers` mock in `couple.tsx` for content keyed off the couple's id, and migrate `store/favorites.ts` from in-memory to a `favorites` table keyed on `user_id` so saves persist across devices.
- **Reanimated/worklets unaffected.** No new worklets introduced; no native deps added; full native rebuild not required for this change.
