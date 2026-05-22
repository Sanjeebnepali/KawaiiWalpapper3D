# 093 — Supabase email + password auth (drop OTP/Resend)

**Date:** 2026-05-22
**Type:** feature

## Problem

The OTP (emailed 6-digit code) login could only ever deliver to ONE inbox.
The email sender (Resend) is in sandbox mode (`onboarding@resend.dev`), which
only delivers to the project owner's own verified Resend account email. Any
*new* email entered on another device failed at the "Send code" step with the
generic "Something went wrong" — because Resend refused to send to it.

Confirmed root cause with the owner: the error appeared right after entering
the email, and the email used was different from the one that already works.
The only fixes for OTP delivery to arbitrary emails are a verified custom
domain (Resend) or another external email service — both rejected. Owner's
decision: **use Supabase only, no external email service, no domain.**

## Solution

Switch the login method from passwordless OTP to **email + password**, which
sends **no email at all** when Supabase's "Confirm email" setting is OFF. A new
user types email + password and is logged in immediately; the `handle_new_user`
DB trigger still creates their `profiles` row. This works for any email, needs
no domain, and keeps the entire data layer (profiles, RLS, couple schema)
exactly as-is — those are all keyed on the same `auth.users.id`.

Why this over Clerk / a domain: Clerk adds a second vendor and requires
re-wiring how Supabase trusts the logged-in user (its RLS is built on Supabase
Auth ids); a domain was explicitly declined. Password auth is the lowest-change
path that satisfies "Supabase only" and never needs email delivery for login.

**One-time Supabase dashboard step (owner does this):** Authentication →
Sign In / Providers → Email → turn **Confirm email OFF**, Save. Without this,
`signUp` returns no session (waits for a confirmation email that never sends).

## Files changed

- `store/auth.ts` — replaced `sendOtp` / `verifyOtp` with `signUp(email, password)`
  (`supabase.auth.signUp`) and `signIn(email, password)`
  (`supabase.auth.signInWithPassword`). Same `{ error }` return shape.
- `app/(auth)/login.tsx` — rewritten: email + password fields, show/hide toggle,
  a Sign in / Create account segmented toggle, and the post-auth
  profile-completion routing that used to live in verify.tsx (route to
  profile-setup when `display_name` is null, else `returnTo` / back).
- `app/(auth)/verify.tsx` — **deleted** (OTP code-entry screen no longer used).
- `app/(auth)/_layout.tsx` — comment updated (Login → Profile-setup).
- `app/(auth)/profile-setup.tsx` — stale "routed from verify.tsx" comment fixed.
- `lib/authErrors.ts` — added `invalid_credentials`, `email_taken`,
  `weak_password` kinds + friendly messages for the password failure modes.

## Verification

1. Flip "Confirm email" OFF in the Supabase dashboard (see above).
2. `npm install --legacy-peer-deps && npx expo run:android --variant release --no-bundler`
3. On device, tap a gated feature (heart / Couple / AI) → Sign in.
4. **Create account** with a brand-new email + a 6+ char password → lands on
   profile-setup → name + avatar → back to the gated feature, signed in.
5. Sign out, **Sign in** with the same email + password → straight back in.
6. Wrong password → "Email or password is incorrect…". Re-used email on Create
   account → "An account with this email already exists…". 5-char password →
   "Password must be at least 6 characters."
7. Second brand-new email on the other phone now works → two accounts → couple
   mode testable.

## Notes

- **No "Forgot password" yet.** A reset link needs email delivery, which we
  deliberately don't have. During beta: owner resets a password from the
  Supabase dashboard, or the user makes a new account. Revisit if/when email
  is ever set up.
- **Email confirmation off** means an email isn't verified as really belonging
  to the user. Low risk for a wallpaper app; revisit before any email-dependent
  feature (receipts, etc.).
- Resend can be fully removed from the Supabase SMTP settings now — it's unused.
  Left in place (harmless) so nothing else that might assume it breaks.
- Existing OTP-created accounts still work — they sign in with email; they just
  need a password set (dashboard) or can re-register if confirmation is off.
