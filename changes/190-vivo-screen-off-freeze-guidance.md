# Change 190: Vivo screen-off freeze — guidance deep-link + FGS importance bump

## Problem

User (Vivo V2231) reported shuffle "stops after 0 seconds" once the phone is
locked. Diagnosed live on a debug build with native-pref polling + alarm dumps:

- **Foreground: WORKS.** With the app open, the exact 5-min alarm fired
  autonomously (native `last_at` advanced 7→8 with no user tap, +1.7s after the
  scheduled time). Apply works every time (`setAsWallpaper` → `{ok:true}`).
- **Screen locked: FROZEN.** With the screen off the alarm never fired — `last_at`
  stayed put for 8+ minutes — **even though**: the app was battery-whitelisted,
  the standby bucket was `active` (10), the phone was **charging** (so stock Doze
  was OFF, `mState=ACTIVE`), and the exact alarm was still armed
  (`RTC_WAKEUP flags 5 windowLength 0`).

The only thing that fits "fails screen-off while charging + whitelisted" is an
**OEM process freeze**. The alarm dump showed `com.vivo.pem.PEM_*` (Vivo Power
Energy Manager) active. Vivo's PEM freezes the app process on screen-off as a
SEPARATE gate from the normal battery "No restrictions" toggle — so the
already-correct exact-alarm + foreground-service + START_STICKY design can't
deliver. This is a device-policy limitation, not an app code bug.

The user couldn't find the Vivo setting that controls it, so the fix is to drive
them straight there and make the service harder to freeze.

## Solution

1. **Deep-link to Vivo "High background power consumption"** — added
   `com.vivo.abe / ExcessivePowerManagerActivity` as the FIRST entry in
   `AUTOSTART_TARGETS` (`lib/backgroundAccess.ts`). On Vivo this is the screen
   that actually governs the screen-off freeze; the existing battery + autostart
   targets do not. `openAutostartSettings()` tries it first and falls back
   through the other OEM targets / app-info as before.

2. **Clearer prompt copy** — the background-access alert now names all three
   levers (Allow background/Autostart, Battery → No restrictions, Vivo
   "Background power" → allow high use) and adds the "lock the app card in Recent
   apps" tip. The 2nd button is relabeled "Background power" and routes to the
   Vivo power screen.

3. **FGS notification importance MIN → LOW** (shuffle service). Aggressive OEMs
   freeze MIN-importance foreground services more readily; LOW is still silent +
   collapsed but is treated as a real ongoing service. The channel ID is bumped
   to `kawaii.shuffle.fg.v2` because Android caches a channel's importance at
   creation — editing the existing MIN channel in place has no effect.

## Files changed

- `lib/backgroundAccess.ts` — Vivo `com.vivo.abe` power-manager target (first);
  rewritten prompt copy + "Background power" button.
- `modules/shuffle-foreground/.../ShuffleForegroundService.kt` —
  `IMPORTANCE_LOW` + channel id `…fg.v2`.

## Verification

- `npx tsc --noEmit` → exit 0, 0 errors (verified standalone before commit).
- `npm test` → 13 suites / 203 tests pass.
- On-device (debug build) this session PROVED: foreground rotation fires on the
  exact 5-min schedule; apply works; the freeze is screen-off-only and
  OEM-driven. The deep-link + importance bump need a release rebuild to validate
  the locked case end-to-end on the V2231.

## Notes

- This does NOT change the (correct) scheduling/apply code — earlier session work
  (changes 187/188 exact-alarm grant, 189 confirm-before-switch) stays.
- Honest ceiling: no app can fully override an OEM that refuses to run it in the
  background. The reliable fix is the user enabling the Vivo "high background
  power" setting (now one tap away) + locking the app in recents. The importance
  bump improves the odds but isn't guaranteed on every Funtouch/OriginOS version.
- The same MIN→LOW bump could be applied to the other three FGS channels
  (context-mood / sleep-wake / friend-checkin) as a follow-up; left out here to
  keep this change focused on the reported shuffle case.
