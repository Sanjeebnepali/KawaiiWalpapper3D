# Premium uploader — fail clearly when given the anon key instead of service_role

**Date:** 2026-05-25
**Type:** fix (tooling)

## Problem

Running `scripts/upload-premium.mjs` with the ANON key (the `EXPO_PUBLIC_SUPABASE_ANON_KEY`
from `.env`) produced a cryptic Supabase error: `Could not create bucket: new row violates
row-level security policy`. The anon role can't create Storage buckets or bulk-upload — that
needs the secret `service_role` key — but the failure didn't say so.

## Solution

`scripts/upload-premium.mjs`:
- Decode the provided key's JWT `role` (no verification needed) and, if it's not
  `service_role`, exit immediately with an explicit message pointing to Supabase →
  Project Settings → API → service_role (and a reminder never to commit it).
- If `createBucket` still fails with an RLS/permission/"violates" message, append a hint
  that the key is almost certainly not the service_role key.

## Files changed

- `scripts/upload-premium.mjs` (JWT role guard + clearer bucket-error hint)

## Verification

Dev-only Node script — not in the app bundle, no rebuild needed. Logic reviewed: the JWT
payload decode handles base64url (`-`/`_`) and is wrapped in try/catch so a malformed key
falls through to the existing checks rather than throwing.

## Notes

- The anon key is safe to expose (it ships in the app bundle by design); the service_role
  key is secret and must only be passed via `$env:SUPABASE_SERVICE_ROLE_KEY` at runtime.
