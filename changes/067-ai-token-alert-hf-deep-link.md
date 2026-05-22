# Token-issue alert: deep-link to Hugging Face

**Date:** 2026-05-19
**Type:** fix (UX)

## Problem

After change 066 the AI 403 path correctly disambiguated into one
of four specific messages (gated model / missing permission /
out of credits / unknown). But the alert's only action button was
"Open Settings" — which routes to the APP'S Settings tab. For
two of the four cases (gated model + missing token permission)
the actual fix happens on huggingface.co, not in our app. User:
"now i got a token issue like when i tried to generate it said
to change from the setting so i got opensetting alert box."

Result: user taps "Open Settings", lands in our AI Generator
Settings, finds nothing actionable there (the embedded default
token is in effect, no token edit available because the issue is
on HF's side), back-buttons out, doesn't know what to do next.

## Solution

`app/(tabs)/ai.tsx` — the `auth_missing | auth_invalid` premiumAlert
now offers THREE buttons:

1. **Cancel** — unchanged.
2. **Edit at HF** (new) — `Linking.openURL` to the relevant
   huggingface.co page. Picked dynamically off the alert message
   text: if the message references a specific model
   (`huggingface.co/{model}`), the button opens that model's
   page (the user gets a one-tap path to the Accept-terms
   button). Otherwise it opens `https://huggingface.co/settings/tokens`
   so the user can edit the token's "Make calls to Inference
   Providers" permission. Wrapped in `.catch` so a missing
   browser doesn't crash anything.
3. **Open Settings** — unchanged. Still relevant for "paste a
   different token in the app" if the user wants to bring their
   own.

The URL extraction uses a single regex on the alert message —
no new prop on the error type, no plumbing through the provider.
Future providers (DALL-E, Stability) that include their own
"open vendor.com/foo" pointer in error messages will get the
same deep-link behaviour automatically.

Imported `Linking` from `react-native` (was unused on this screen
before — `Linking.openSettings()` is used elsewhere in the app
but this screen had no need until now).

## Files changed

- `app/(tabs)/ai.tsx` — `Linking` import + 3-button alert variant
  for `auth_missing | auth_invalid`.
- `changes/README.md` — index row.

## Verification

`run` to rebuild, then:

1. AI tab → Generate (token still in 403 state)
2. Token-issue alert appears with THREE buttons now.
3. Tap **Edit at HF** → device's browser opens to either:
   - `https://huggingface.co/settings/tokens` (permission /
     credit cases) — toggle "Make calls to Inference Providers"
     on the token, save, return to app.
   - `https://huggingface.co/{model}` (gated-model case) —
     click Accept on the model page, return to app.
4. Retry generation. Should now hit 200 / 503.

## Notes

- **Regex matches first URL** in the message. Our 403 messages
  reference at most one HF URL, so this is safe. If a future
  message references both `huggingface.co/{model}` and
  `huggingface.co/settings/tokens`, the first wins — write the
  message accordingly.
- **The `.catch` on openURL** is a sanity guard for a device
  with no default browser configured. Toast tells the user; no
  crash. Same pattern as `app/(tabs)/profile.tsx`'s Terms /
  Privacy links.
- **iOS:** `Linking.openURL` opens Safari (or default browser).
  Same UX. No platform branch needed.
- **The premiumAlert sheet handles a 3-button layout fine** — it
  uses a vertical stack so the buttons just get more space. No
  layout tuning needed.
