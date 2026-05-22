/**
 * Map Supabase auth error strings to friendly messages + behavior hints.
 *
 * Supabase returns errors as opaque strings (e.g. "Email rate limit exceeded",
 * "For security purposes, you can only request this once every 60 seconds.",
 * "Token has expired or is invalid"). The strings shift between Supabase
 * versions, so we match on substrings, not exact equality.
 *
 * The classifier returns:
 *   - kind: a stable tag the UI can switch on
 *   - message: user-facing copy (no technical jargon)
 *   - retryAfterSec: when present, how long to disable the retry button
 */

export type AuthErrorKind =
  | 'invalid_credentials'   // email/password sign-in didn't match an account
  | 'email_taken'           // sign-up with an email that already has an account
  | 'weak_password'         // password shorter/simpler than Supabase requires
  | 'rate_limit_project'    // hourly cap (~3-4/hr on free SMTP, removed by Resend)
  | 'rate_limit_address'    // 60s cooldown between sends to same email
  | 'invalid_code'          // wrong 6-digit code
  | 'expired_code'          // code older than ~1 hour
  | 'invalid_email'         // shape OK to client regex but Supabase rejected
  | 'too_many_attempts'     // many failed verify attempts in short window
  | 'network'               // fetch failed (offline / DNS / TLS)
  | 'unknown';              // fallback — log the raw msg

export type ClassifiedError = {
  kind: AuthErrorKind;
  message: string;
  retryAfterSec?: number;
};

/**
 * Parse "every N seconds" out of Supabase's per-address rate-limit message so
 * we can drive the cooldown countdown off the server's authoritative window
 * (not a client guess that drifts).
 */
function parseRetrySeconds(raw: string): number | undefined {
  const m = raw.match(/(\d+)\s*seconds?/i);
  if (!m) return undefined;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : undefined;
}

export function classifyAuthError(raw: string | null | undefined): ClassifiedError | null {
  if (!raw) return null;
  const msg = raw.toLowerCase();

  // --- Email + password (current auth method) ---

  // Wrong email/password on sign-in. Supabase returns "Invalid login credentials".
  if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
    return {
      kind: 'invalid_credentials',
      message:
        "Email or password is incorrect. If you're new here, tap Create account instead.",
    };
  }

  // Sign-up with an email that already has an account.
  if (msg.includes('already registered') || msg.includes('already been registered') ||
      msg.includes('user already exists')) {
    return {
      kind: 'email_taken',
      message: 'An account with this email already exists. Switch to Sign in to log in.',
    };
  }

  // Password too short / too weak. Supabase: "Password should be at least 6 characters".
  if (msg.includes('password should be') || msg.includes('weak password') ||
      msg.includes('password should contain') || msg.includes('at least 6')) {
    return {
      kind: 'weak_password',
      message: 'Password must be at least 6 characters. Pick a longer one.',
    };
  }

  // Per-project hourly cap on free Supabase SMTP. Visible to admin, opaque to user.
  if (msg.includes('email rate limit')) {
    return {
      kind: 'rate_limit_project',
      message:
        "We've hit our hourly email limit. Please try again in about an hour, " +
        'or use a different email address.',
    };
  }

  // Per-address 60-second cooldown — the message includes the seconds count.
  if (msg.includes('once every') || msg.includes('for security purposes')) {
    return {
      kind: 'rate_limit_address',
      message: 'Please wait a few seconds before requesting another code.',
      retryAfterSec: parseRetrySeconds(raw) ?? 60,
    };
  }

  // Supabase combines wrong-code and expired-code into a single error string
  // ("Token has expired or is invalid"). Treat the combined case as invalid
  // first — wrong-code is far more common than expired-code in real usage,
  // and the friendly copy covers both situations honestly.
  if (
    (msg.includes('expired') || msg.includes('invalid')) &&
    (msg.includes('token') || msg.includes('otp') || msg.includes('code'))
  ) {
    return {
      kind: 'invalid_code',
      message:
        "That code didn't work. Make sure you've entered all the digits from " +
        'the most recent email, or tap Resend to get a fresh code.',
    };
  }

  if (msg.includes('expired')) {
    return {
      kind: 'expired_code',
      message: 'This code expired. Tap Resend to get a new one.',
    };
  }

  if (msg.includes('too many') || msg.includes('rate limit')) {
    return {
      kind: 'too_many_attempts',
      message: 'Too many attempts. Wait a few minutes and try again.',
    };
  }

  if (msg.includes('invalid email') || msg.includes('email address')) {
    return {
      kind: 'invalid_email',
      message: "That email address didn't work. Check for typos and try again.",
    };
  }

  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to')) {
    return {
      kind: 'network',
      message: "Can't reach the server. Check your internet connection and try again.",
    };
  }

  // Fallback — keep something showing rather than a blank.
  return {
    kind: 'unknown',
    message: 'Something went wrong. Please try again in a moment.',
  };
}
