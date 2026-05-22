# AI generator: fix "402 after ~2 generations" (free-tier rate gate)

**Date:** 2026-05-20
**Type:** fix

## Problem

User report: AI image generation works for the first ~2 images, then
every subsequent generation fails with a `402` error.

Diagnosed against Pollinations' current API docs:

- `402` = **"insufficient balance."** Pollinations moved to a tiered
  model. The **anonymous** tier (what we used) allows **one request
  every 15 s**. Generating two images in quick succession blows past
  that window and the server bounces the third with `402` / `429`.
- The old `lib/ai/providers/pollinations.ts` treated `402` as a generic
  `unknown` → "Pollinations returned 402. Please retry." Retrying
  immediately just hammers the limit again, so it looked permanently
  broken.

Tiers (per docs): Anonymous 1/15 s (no auth) · Seed 1/5 s (free token) ·
Flower 1/3 s (paid).

## Solution

Product owner chose "keep it free, best-effort." Reworked the provider so
it never *exceeds* the free window in the first place, and explains the
wait clearly when the user does generate too fast.

`lib/ai/providers/pollinations.ts`:

1. **Client-side rate gate (the real fix).** A module-level
   `lastRequestAt` stamp. If a new request arrives inside the tier's
   window (15 s anon / 5 s with a token), we return a friendly
   `rate_limited` result with a precise countdown
   (`"Free tier allows one image every 15s. Try again in 9s…"`) instead
   of firing a doomed request. No silent 15 s spinner, no surprise 402.
2. **Explicit 402 / 429 handling.** Mapped to `reason: 'rate_limited'`
   with a clear message + `retryAfterMs`, not a cryptic status dump.
3. **`referrer` param** added to the request URL so Pollinations can
   attribute traffic to the app.
4. **Optional Bearer token.** Reads `pollToken` from the AI store; when
   set, sends `Authorization: Bearer …` (moves the user to the 5 s
   "seed" tier) and shrinks the gate accordingly. Anonymous still works
   with no token — the token is a pure speed upgrade.
5. **One retry on transient 5xx** only (server hiccup), with an
   abort-aware `sleep`. 402/429 are NOT retried (they need the window to
   pass — the gate + countdown handle them).

`store/ai.ts`:
- New `pollToken: string` field (default `''`), `setPollToken` action,
  persisted in the existing `@kawaii/ai@v1` blob. Hydrate already
  spreads persisted state, so it round-trips automatically.

`app/(tabs)/profile.tsx`:
- The single "AI Generator token" row is now **provider-aware**. When
  the active provider is Pollinations it edits `pollToken` (optional, no
  `hf_` prefix, copy explains "works free without it; a free token
  raises the limit"). When Hugging Face, the existing behaviour is
  unchanged.

The daily spend cap (`maxGenPerDay`) in `lib/ai/client.ts` is untouched
and still gates calls before the provider runs.

## Files changed

**Modified:**
- `lib/ai/providers/pollinations.ts` — rate gate, 402/429 handling,
  referrer, optional Bearer token, 5xx retry, abort-aware sleep.
- `store/ai.ts` — `pollToken` state + `setPollToken` + DEFAULTS entry.
- `app/(tabs)/profile.tsx` — provider-aware token sheet (label,
  subtitle, status, placeholder, hint, save/clear).

## Verification

JS-only — no native rebuild needed; picks up on Metro reload (the APK in
this pass embeds it anyway).

1. AI tab → generate an image → succeeds.
2. Immediately tap Generate again (within 15 s) → friendly toast: "Free
   tier allows one image every 15s. Try again in Ns…" (NOT a 402).
3. Wait the countdown out → generate → succeeds. Repeat → no permanent
   402 loop.
4. Settings → AI Generator token (with Pollinations active) → shows
   "Free · no token"; paste a token from auth.pollinations.ai → status
   flips to the masked token; generations now allowed every ~5 s.
5. Leave the token blank → still generates for free on the 15 s cadence.

## Notes

- **Why a gate instead of just retrying:** retrying a 402 inside the
  window fails again. The only real remedy on the free tier is to space
  requests to the tier's cadence — which we now do, and tell the user
  about.
- **Token is optional by design** — the owner explicitly chose "no
  signup." The plumbing is there so a free token can later unlock the
  faster tier with zero code change.
- A typical generation already takes ~5–15 s to come back, so in normal
  use the gate rarely triggers — it only catches impatient double-taps.
