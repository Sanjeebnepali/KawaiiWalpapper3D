# Change 191: Verify the battery-exemption actually took (Vivo silently ignores "Allow")

## Problem

Change 190 deep-links the user to the battery-optimization exemption + Vivo
"High background power" so timed wallpaper changes survive the screen-off freeze.
But on a Vivo V2231 (production release build) the user tapped **Allow** on the
standard battery dialog and the system **silently did not record the exemption** —
`isBatteryWhitelisted()` still returned false afterward (confirmed live: the app
was absent from `dumpsys deviceidle whitelist` even though the user had tapped
Allow). Tapping a button that does nothing is the worst possible UX: the user
believes they fixed it, but background rotation stays frozen.

## Solution

`openBatteryThenVerify()` in `lib/backgroundAccess.ts`: open the battery setting,
then register a **one-shot `AppState` listener**. When the user returns to the
app (foreground), re-check `isBatteryWhitelisted()`; if it STILL didn't take, show
an explicit follow-up — "That didn't save — one more try" — with an "Open again"
button that reopens the setting. The "Battery" button in the background-access
prompt now routes through this verifier instead of a fire-and-forget open.

Safeguards:
- One-shot: the listener removes itself on the first foreground return.
- 90s safety timeout tears the listener down if the user never returns or an OEM
  drops the AppState event, so it can't linger or fire stale.
- 600ms read-back delay so the OS has committed the exemption before we query it
  (the whitelist read can lag the settings write on some OEMs).
- Re-check gates on `isBatteryWhitelisted()` so a user who DID succeed sees no
  follow-up.

## Files changed

- `lib/backgroundAccess.ts` — add `AppState` import; `openBatteryThenVerify()`;
  route the prompt's "Battery" button through it.

## Verification

- `npx tsc --noEmit` → exit 0, 0 errors.
- `npm test` → 13 suites / 203 tests pass.
- Root behaviour was confirmed live this session: with the battery whitelist
  actually applied (forced via adb to match what the setting *should* do) PLUS
  Vivo high-background-power on, shuffle rotated while the phone was locked
  (`dumpsys alarm` wakeup stats showed the shuffle FIRE alarm firing with the
  screen Asleep). This change closes the gap where the user's tap didn't apply
  the exemption. Needs a release rebuild to validate the follow-up dialog on the
  V2231.

## Notes

- This is a UX-reliability fix, not a new capability: no app can force an OEM to
  honour the exemption, but we can detect when the user's tap didn't stick and
  guide them to retry instead of leaving them with a silent failure.
- The Vivo "High background power" setting has no readable API, so it can't be
  verified the same way — only the battery-optimization whitelist is queryable
  (`isIgnoringBatteryOptimizations()`).
