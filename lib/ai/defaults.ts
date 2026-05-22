/**
 * Build-time defaults for the AI subsystem.
 *
 * These values get compiled into the APK and serve as fallbacks when the
 * user hasn't pasted their own credentials in Settings. The pattern:
 *
 *   user-supplied token   →   active token (preferred, higher quota for them)
 *   no user token          →   DEFAULT_HF_TOKEN (works out of the box)
 *   neither set            →   provider's isConfigured() returns false; UI
 *                              prompts the user to add one.
 *
 * ─── Security notes (read before changing) ───────────────────────────
 *
 * 1. ANYONE WITH THE APK CAN EXTRACT THESE VALUES. Decompiling an APK
 *    is trivial. Treat the embedded token as semi-public.
 * 2. Use this ONLY for tokens with TIGHT free-tier quotas (Hugging Face
 *    free is fine — 30k req/month, abuse just hits the ratelimit, no
 *    direct $ cost). DO NOT embed a paid OpenAI / Stability key here —
 *    those get drained by abuse and you pay the bill.
 * 3. For paid APIs, replace this file with a thin client that calls
 *    YOUR backend, which holds the real key. The backend pattern is
 *    documented in `KNOWN_ISSUES.md` under "Architecture trade-offs."
 * 4. If you suspect this token is being abused (sudden quota spikes,
 *    HF emails you about ToS violations), ROTATE it:
 *      - https://huggingface.co/settings/tokens
 *      - Delete the old, create a new "Read" token
 *      - Update `EXPO_PUBLIC_HF_TOKEN` in `.env`
 *      - Rebuild + push an update
 *    Existing installs keep working until they update; new requests
 *    from the old APK 401 — the provider's `auth_invalid` error UI
 *    points the user to paste their own token in Settings.
 *
 * ─── git hygiene ──────────────────────────────────────────────────────
 *
 * The token is kept in `.env` (gitignored) and read via
 * `process.env.EXPO_PUBLIC_HF_TOKEN`, so it is never committed to the
 * repo. This is required for the GitHub remote, whose push protection
 * rejects commits containing HF tokens. Clones without a `.env` build
 * with no default token (users add their own in Settings).
 */

/**
 * Default Hugging Face Inference API token — used when the user hasn't
 * set their own in Settings → AI Generator Settings.
 *
 * The value is NOT hardcoded here — it's read from `.env` (which is
 * gitignored) via Expo's `EXPO_PUBLIC_*` convention, the same pattern
 * `lib/supabase.ts` uses for Supabase keys. It's still inlined into the
 * APK at build time (anyone who decompiles the APK can read it), but it
 * stays out of the git repo so GitHub's secret scanner doesn't flag it.
 *
 * To set / rotate the token:
 *   1. https://huggingface.co/settings/tokens → create/revoke a "Read" token
 *   2. Put it in `.env` as `EXPO_PUBLIC_HF_TOKEN=hf_…` (see `.env.example`)
 *   3. Rebuild the APK (`run`)
 *
 * If `.env` has no token, this is an empty string: AI generation falls
 * back to the user pasting their own token in Settings (UI handles it).
 */
export const DEFAULT_HF_TOKEN = process.env.EXPO_PUBLIC_HF_TOKEN ?? '';

/**
 * Default model id. The user can override per-install in Settings; this
 * is what new installs use until they pick something else.
 *
 * Why SDXL and not FLUX:
 *   - `black-forest-labs/FLUX.1-schnell` was moved off HF's free
 *     serverless Inference API in late 2024 and now requires going
 *     through paid Inference Providers (returns 404 on the legacy
 *     endpoint).
 *   - `stabilityai/stable-diffusion-xl-base-1.0` is reliably available
 *     on the free serverless endpoint, no terms acceptance needed,
 *     produces decent wallpaper-friendly output at 1024×1024.
 *
 * The user can switch via Settings → AI Generator Settings → model
 * picker (when we wire it; for now `hfModelId` in the store is the
 * single source of truth and the provider reads it on every call).
 */
export const DEFAULT_HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0';
