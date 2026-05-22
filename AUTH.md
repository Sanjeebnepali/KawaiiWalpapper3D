# Authentication — overview, design, and production roadmap

This is the durable reference for the auth system. The per-change history
lives in `changes/043-supabase-auth.md`, `044-profile-setup.md`,
`046-otp-hardening-and-resend.md`, and `093-supabase-password-auth.md`. This
file is the bird's-eye view: what we built, why, how it fits together, and
what's still needed before the app can ship publicly.

> **⚠️ CURRENT METHOD (change #093): email + password, NOT OTP.**
> The emailed-6-digit-code (OTP) flow below is **historical**. It was replaced
> because Resend in sandbox mode only delivers to the owner's own email, so no
> new user could receive a code. The app now uses `supabase.auth.signUp` /
> `signInWithPassword` with Supabase's **"Confirm email" turned OFF** — sign-up
> returns a session instantly and sends **no email**, so any email works with
> no domain and no external service. `verify.tsx` is deleted; `login.tsx` is now
> email+password with a Sign in / Create account toggle. Resend is unused.
> Trade-off: no self-serve "Forgot password" (would need email) — reset from
> the Supabase dashboard for now. Everything below about the OTP UX, Resend
> SMTP, and the friendly rate-limit classifier is kept for context only.

## What we built (in one session)

Three changes, in order, that take the app from "no concept of a user" to
"any user can sign in with email + OTP, complete a profile, and the gated
features work":

| # | Change | What landed |
|---|--------|-------------|
| 043 | Supabase auth Phase 1 | Email + 6-digit OTP, soft gating on Couple / AI / favorites, invite-code generation, `profiles` table + RLS, root layout bootstraps the session |
| 044 | Profile-setup form | Mandatory display-name + avatar picker after first sign-in, edit later from Settings |
| 046 | OTP hardening + Resend SMTP | Friendly error messages, 30s resend cooldown with live countdown, "use a different email" escape, swap built-in SMTP for Resend |

After these, a fresh user can:
1. Tap a gated feature → premium-alert prompt → tap Sign in
2. Enter email → receive 6-digit code from Resend → enter code
3. Land on profile setup → name + avatar → Continue
4. Land back on the gated feature, signed in, with an invite code ready
   for the future couple-pairing flow

## Why each design decision

### Why Supabase
- Free tier covers MVP + early beta (50k MAUs free, RLS for security).
- Postgres backing — no NoSQL gymnastics; SQL we can read.
- Drop-in auth with `auth.users.id` as the universal user id — no custom
  user table to build.
- Same project can host the future couple-pairing DB tables.

### Why email + OTP, not password
- One screen of friction less for first-time users.
- No "forgot password" recovery flow to build.
- Easier to mentally upgrade to OAuth later (the OTP path becomes the
  fallback for users without Google/Apple accounts).
- Trade-off: 30-second context-switch to the email app. Mitigated by the
  cooldown countdown and "use a different email" escape we added in #046,
  and removed entirely when OAuth lands in #047.

### Why soft gating (not hard gate at launch)
- Users get to feel the app before being asked to commit.
- Most wallpaper browsing has no need of a user id — favorites, generations,
  and couple features do, and those are exactly the screens that prompt.
- Drop-off is lower for a soft gate by a wide margin in real-world data.

### Why a profile-setup gate after first sign-in
- Couple Theme (the actual feature this whole user-id system exists for)
  needs a real name to address people by.
- A name asked *once*, immediately, costs less than a name asked never
  (cluttering every other surface with "Hey Kawaii User").
- Avatars are emoji-on-color — no asset pipeline, no upload — so the form
  stays a single screen.

### Why we held gender for later
- Gender only matters for couple type (M+F / F+F / M+M) which is a couple
  pairing concern, not a profile concern.
- Collecting it at pairing time keeps the signup form short and lets us
  default to "Prefer not to say" cleanly when neither partner answered.

### Why Resend for SMTP
- Supabase's built-in SMTP caps at 3–4 emails per hour per project — fine
  for the first developer, fatal for any real-world testing.
- Resend's free tier is 3000 emails/month + 100/day burst — covers the
  beta window without paying.
- Configuration is 6 fields in the Supabase dashboard; the app never
  touches Resend directly.

### Why the friendly error classifier
- Supabase returns strings like
  `"For security purposes, you can only request this once every 60 seconds"`.
  Users read that and assume something is broken.
- Translating to `"Please wait a few seconds before requesting another code"`
  is one line of code per failure mode and saves a support ticket per user.
- The classifier matches on substrings (not exact equality) so it survives
  Supabase SDK version bumps that change the wording.

### Why the cooldown is module-scope state, not Zustand
- Supabase's server-side cooldown lives on the server regardless of what
  the UI does. Putting our timer in Zustand would mean it survives signouts
  and process restarts pointlessly — when the server has already cleared
  the window.
- Module scope ties the cooldown to the process lifetime, which is the
  right shape: same process = honor the server's window; new process =
  start fresh and let the server respond.

## How it fits together (architecture map)

```
┌──────────────────────────────────────────────────────────────────────┐
│  User taps gated feature (heart / Couple / AI / Settings sign-in)    │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
         ┌─────────────────────────────────────┐
         │  useRequireAuth() → premium alert    │   anon
         │  → router.push('/(auth)/login')      │ ─────────►
         └─────────────────────────────────────┘            │
                                                            ▼
                              ┌──────────────────────────────────┐
                              │  app/(auth)/login.tsx             │
                              │  • email field + regex validate   │
                              │  • sendOtp → markOtpSent(email)   │
                              │  • errors via classifyAuthError   │
                              └──────────────────────────────────┘
                                                │
                                                ▼
                              ┌──────────────────────────────────┐
                              │  app/(auth)/verify.tsx            │
                              │  • 6-digit input, 30s cooldown    │
                              │  • verifyOtp → refreshProfile     │
                              │  • "use a different email" escape │
                              └──────────────────────────────────┘
                                                │
                                  display_name? │
                          ┌─────────── null ────┴───── set ─────┐
                          ▼                                     ▼
        ┌──────────────────────────────────┐   ┌──────────────────────────────┐
        │  app/(auth)/profile-setup.tsx     │   │  router.replace(returnTo)    │
        │  • name + avatar (8-tile grid)    │   │  back to the gated feature   │
        │  • supabase.from('profiles').update│   └──────────────────────────────┘
        │  • refreshProfile → replace home  │
        └──────────────────────────────────┘
```

The Supabase session is rehydrated on app boot from AsyncStorage by
`useAuthStore.getState().bootstrap()` in `app/_layout.tsx`. Subsequent
launches with a valid session skip the whole `(auth)` group entirely.

### File map

```
app/(auth)/
  _layout.tsx         Stack, no header
  login.tsx           email → sendOtp → push verify
  verify.tsx          6-digit OTP, cooldown, friendly errors
  profile-setup.tsx   dual-use signup + edit (isEdit param)

store/auth.ts         Zustand store: session/user/profile, OTP actions
lib/supabase.ts       client with AsyncStorage + react-native-url-polyfill
lib/authErrors.ts     classifyAuthError → friendly text + retryAfterSec
hooks/useRequireAuth.ts   soft-gate hook → premium-alert + router.push

constants/avatars.ts  8 emoji-on-color avatars, stable string ids

supabase/schema.sql   profiles table, gen_invite_code, handle_new_user
                      trigger, RLS policies, avatar_id column
```

## Database schema (what lives in Supabase)

```sql
-- 1 row per auth.users — keyed by the same uuid.
public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  display_name text,
  avatar_id    text,                     -- key into constants/avatars.ts
  invite_code  text UNIQUE NOT NULL,     -- 6-char, no ambiguous letters
  created_at   timestamptz NOT NULL DEFAULT now()
)

-- Trigger: every new auth.users → insert into public.profiles with a
-- freshly-generated invite_code. Retries 5× on rare collision.
trigger on_auth_user_created AFTER INSERT ON auth.users
  → handle_new_user() SECURITY DEFINER

-- RLS: users see only their own row.
policy "read own profile"   USING (auth.uid() = id)
policy "update own profile" USING (auth.uid() = id)
policy "insert own profile" WITH CHECK (auth.uid() = id)
```

The full SQL is in `supabase/schema.sql` — that file is authoritative;
the Supabase Studio dashboard is just the editor.

## Supabase dashboard configuration (state right now)

| Section | Setting | Value |
|---------|---------|-------|
| Authentication → Providers → Email | Enabled | ON |
| Authentication → Providers → Email | Confirm email | ON |
| Authentication → Providers → Email | OTP Length | **6** (was 8 — caused real bugs) |
| Authentication → URL Configuration | Site URL | `kawaii://` |
| Authentication → URL Configuration | Redirect URLs | `kawaii://**` |
| Authentication → Email Templates → Magic Link | Body | uses `{{ .Token }}` (not `{{ .ConfirmationURL }}`) |
| Authentication → Email Templates → Confirm signup | Body | uses `{{ .Token }}` |
| Project Settings → Auth → SMTP Settings | Enable Custom SMTP | ON |
| Project Settings → Auth → SMTP Settings | Host / Port / User | `smtp.resend.com` / `465` / `resend` |
| Project Settings → Auth → SMTP Settings | Sender | `onboarding@resend.dev` (sandbox — see below) |

## What's still missing for production launch

### Critical (block public launch)

| Item | Why it blocks | Change # |
|------|---------------|----------|
| **Custom domain in Resend** | Sandbox sender only delivers to the verified Resend account email. Any non-developer signup fails silently. | within #046 follow-up |
| **Google OAuth** | One-tap signin removes the dominant friction point. Industry standard. | #047 |
| **Apple OAuth** | **Mandatory** on iOS if you ship any other social login (App Store guideline 4.8). | #047 |
| **Couple pairing flow** | The feature the entire user-id system was built for. Right now invite codes exist but there's nowhere to enter a partner's. | #045 |
| **Web platform support** | App spec is "every platform" — current code is RN-only. | #048 |

### Important (improve experience, not blocking)

- **Favorites persistence**: `store/favorites.ts` is still in-memory. Move
  to a `favorites` table keyed on `user_id` so saves follow the user across
  devices.
- **Settings persistence**: same — `store/settings.ts` should sync at least
  the user-facing toggles to a `user_settings` table.
- **Captcha**: Cloudflare Turnstile via Supabase's CAPTCHA setting (no app
  code change) once sign-in becomes a vector for abuse.
- **Email branding**: replace the plain HTML in the email templates with
  a designed version (logo, brand colors).
- **Edit profile**: the pencil button in Settings works but the screen
  could surface email change / delete account / change theme color — all
  routed through `profile-setup.tsx` with mode params.

### Nice to have

- **Magic link as fallback to OTP**: some users prefer tapping a link to
  typing a code. Supabase supports both simultaneously.
- **Push notifications when partner pairs**: requires #045 first.
- **Anniversary tracking** based on couple `created_at`.

## Production checklist (do in this order)

```
[ ] Resend custom domain
    [ ] Buy domain if not owned (Cloudflare / Namecheap / Porkbun)
    [ ] Resend dashboard → Domains → Add Domain
    [ ] Paste SPF / DKIM / DMARC records at registrar
    [ ] Wait for verification (5–60 min)
    [ ] Swap Supabase SMTP sender to noreply@yourdomain.com

[ ] OAuth (#047)
    [ ] Google Cloud Console → OAuth client (Android, iOS, Web)
    [ ] Apple Developer → Services ID
    [ ] Supabase → Authentication → Providers → enable Google, Apple
    [ ] App → expo-auth-session integration on login screen
    [ ] Test on both platforms

[ ] Couple pairing (#045)
    [ ] Postgres: couples table + RLS
    [ ] RPC: pair_with_code(code) — validates, inserts, rotates both codes
    [ ] App: "Enter partner's code" UI on Couple tab
    [ ] App: collect gender during pairing
    [ ] Filter couple wallpaper grid by computed couple type

[ ] Web (#048)
    [ ] Expo Router web build smoke test
    [ ] Native-module fallbacks: mood camera, sensors, background tasks
    [ ] lib/supabase.ts → detectSessionInUrl: true on web
    [ ] PWA manifest + deploy target

[ ] Branding
    [ ] Replace Supabase email templates with designed HTML
    [ ] App icon + splash for production builds
    [ ] Privacy policy + terms (currently dummy URLs in profile.tsx)

[ ] Observability
    [ ] Sentry or PostHog for client-side errors
    [ ] Supabase Auth Logs review cadence
    [ ] Resend Emails dashboard cadence

[ ] Pre-launch test
    [ ] Two non-developer testers complete full flow on iOS + Android
    [ ] Edge cases: code expiry, wrong email, rate limit, offline
    [ ] Sign out → sign back in works without data loss
```

## How to debug auth issues (playbook from this session)

The same debugging steps that worked in this session — keep these handy.

### "Email never arrives"

1. **Resend dashboard → Emails** — does the send attempt appear?
   - Yes, Delivered → check spam folder.
   - Yes, Bounced → click for the exact reason (commonly: recipient address
     issue, content blocked).
   - No → Supabase isn't reaching Resend. SMTP config likely not saved.

2. **Supabase dashboard → Authentication → Logs** — most recent entry
   shows the SMTP error verbatim.

3. **Sandbox restriction**: if using `onboarding@resend.dev` as sender,
   only the Resend account email receives. Test with that email or
   verify a custom domain.

### "Something went wrong" / unknown error

The friendly classifier in `lib/authErrors.ts` falls back to this message
when the Supabase error string doesn't match any pattern. Add the missing
pattern to the classifier:

1. `adb logcat -d --pid=$(adb shell pidof com.kawaii.wallpapers) | grep "\[auth\]"`
   surfaces the raw error string.
2. Add a substring match in `classifyAuthError` for that string.

### "8 digits in email, app only accepts 6"

Supabase → Authentication → Providers → Email → **OTP Length** → set to 6.

### "Email shows a link, no code"

Email templates aren't using `{{ .Token }}`. Authentication → Email
Templates → both **Magic Link** and **Confirm signup** must use the
token variable, not the confirmation URL.

### White splash forever on dev build

Phone can't reach Metro. Common when laptop has a public IP that the LAN
doesn't route. Fix via USB:

```
adb reverse tcp:8081 tcp:8081
adb shell am force-stop com.kawaii.wallpapers
adb shell am start -a android.intent.action.VIEW \
  -d "kawaii://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

### Rate limit hit

The hourly cap is gone now that Resend is the SMTP. If you ever see it
again, it means Custom SMTP toggled off — check Supabase → Project
Settings → Auth → SMTP Settings.

## Open questions / decisions to revisit

- **Email-based PII handling**: should we hash or null email after some
  inactivity window? GDPR-adjacent.
- **Multi-device session limits**: Supabase tracks sessions per device but
  doesn't enforce a max. Decide if we want one.
- **Couple un-pair behavior**: when one partner unpairs, the other gets
  what — a notification? Silently moved back to single? Both codes
  rotated automatically? Decide before #045 ships.
- **Display-name moderation**: anyone can set their `display_name`
  to anything. Eventually need content-mod on this field if names appear
  to other users (Couple Theme's partner card will).

## Where to look first if you're new to this codebase

Read in this order, ~30 minutes total:

1. `CLAUDE.md` — project conventions and dependency pins.
2. This file — the why.
3. `store/auth.ts` — the heart of the auth state.
4. `app/(auth)/verify.tsx` — the most user-facing piece, easy to map UI
   to code.
5. `supabase/schema.sql` — the DB shape.
6. `changes/043-supabase-auth.md`, `044`, `046` — the per-change details.
