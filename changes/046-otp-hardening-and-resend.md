# 046 — OTP hardening + Resend SMTP

## Problem

Two production blockers stacked on the auth flow from #043:

1. **Supabase's built-in SMTP caps at 3–4 emails per hour per project.** Two
   real testers hitting the sign-in flow burns the quota in a few minutes;
   subsequent users see opaque `"Email rate limit exceeded"` errors and
   can't sign in.
2. **The OTP UX surfaced raw Supabase strings.** Users got messages like
   `"For security purposes, you can only request this once every 60 seconds"`
   with no countdown, no "use a different email" escape, and no path forward
   on rate-limit. They could spam the Resend button and dig themselves deeper.

User specifically asked: "if a user fails to enter a valid email twice, will
the app break?" Short answer: no (no permanent lockout), but the UX makes it
feel broken. This change makes the failure modes graceful.

## Solution

**App side (this change):**

- New `lib/authErrors.ts` — `classifyAuthError(raw)` substring-matches
  Supabase's error strings into 8 stable `kind`s with friendly messages.
  Some return a `retryAfterSec` parsed out of the server's
  "wait N seconds" message so the cooldown is driven off the authoritative
  window, not a client guess.
- `app/(auth)/login.tsx` + `verify.tsx` route all errors through the
  classifier — users see plain English.
- **30-second Resend cooldown** with live `Resend in 24s` countdown. The
  cooldown is anchored in a module-scope `Map<email, timestamp>` so
  navigating back to login and forward to verify doesn't reset it (Supabase's
  server-side cooldown wouldn't reset either — UI now matches reality).
- Initial send from `login.tsx` calls `markOtpSent(email)` so the user can't
  burn the resend immediately on arriving at the verify screen.
- New **"Use a different email"** link on the verify screen — `router.replace`
  back to login, escaping verify state without closing the app.
- If Supabase returns a longer-than-30 s retry window, the UI honors it
  rather than capping at 30.

**Supabase side (you do this once):** swap the built-in SMTP for **Resend**
(3000 emails/month free, ~5 min signup, custom-domain support). After
configuration the per-hour cap is gone — Resend's free tier supports
~100/day burst, 3000/month, and lifts entirely with paid plans.

## Files changed

**New:**
- `lib/authErrors.ts` — error classifier. 8 `AuthErrorKind`s
  (`rate_limit_project`, `rate_limit_address`, `invalid_code`, `expired_code`,
  `invalid_email`, `too_many_attempts`, `network`, `unknown`).

**Modified:**
- `app/(auth)/verify.tsx` — module-scope `lastSendAt` map, 1Hz cooldown tick
  via `setInterval`, error classification, resend-disabled state with
  countdown label, "Use a different email" link, exported `markOtpSent` so
  login can prime the timer.
- `app/(auth)/login.tsx` — error classification, calls `markOtpSent` on
  successful send.

## Supabase-side setup (one-time)

### Resend signup
1. https://resend.com → sign up → verify email.
2. Sidebar → **API Keys** → **Create API Key** → name `supabase-kawaii`,
   permission **Sending access**, all domains. Copy the `re_...` key.
3. Choose sender:
   - **Sandbox** (no domain): can only deliver to your verified Resend account
     email. Fine for solo dev, breaks for real users. Sender:
     `onboarding@resend.dev`.
   - **Custom domain**: Resend dashboard → **Domains** → **Add Domain**, paste
     domain, copy 3 DNS records (SPF / DKIM / MX return-path), add at your
     DNS provider, click **Verify** when propagated (~5–15 min). Sender:
     `noreply@yourdomain.com`.

### Wire Supabase to Resend
**Supabase dashboard → Project Settings → Auth → SMTP Settings:**
- Toggle **Enable Custom SMTP** ON
- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: the `re_...` API key from above
- Sender email: `onboarding@resend.dev` (sandbox) or `noreply@yourdomain.com` (custom)
- Sender name: `Kawaii Baby Wallpapers`
- Save.

Test by tapping Sign in → Send code from the app. Email should arrive within
seconds with no rate limit.

## Verification

- Enter invalid email shape → button disabled (regex), no submit possible.
- Enter valid email, tap Send → land on verify screen with `Resend in 30s`
  countdown visible; button disabled until it hits 0.
- Tap Resend while ticking → no-op (disabled state).
- After 30s, tap Resend → fresh code, countdown resets to 30.
- Type wrong 6-digit code → see `"That code didn't match..."` (not the raw
  Supabase message).
- Wait >1 hour, type a code → see `"This code expired..."`.
- Tap "Use a different email" → routed to login with field cleared.
- After SMTP swap to Resend: previously rate-limited account can sign in
  immediately, no `"email rate limit exceeded"`.

## Notes

- **Why module-scope state, not Zustand:** the cooldown is a transient UI
  concern tied to a specific (email, instance-of-app-process). Putting it in
  the auth store would persist it pointlessly across signouts and across
  process restarts where Supabase's server-side cooldown has already cleared.
- **Network error detection is best-effort.** RN doesn't surface a stable
  error code for fetch failures across versions; we match on substrings.
  If a user sees the "unknown" fallback, the raw string is still logged via
  `console.error` paths inside Supabase's client for ops debugging.
- **Out of scope:** captcha / abuse prevention. If sign-in becomes a vector
  for abuse, plug Cloudflare Turnstile into Supabase's CAPTCHA setting (no
  app-side change required — Supabase handles the challenge).
- **Next steps toward production-ready auth:** #047 adds Google + Apple OAuth
  as primary (one-tap), with this OTP path remaining as fallback. #048
  brings web platform support.
