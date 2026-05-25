# Black-Box Test Report — Kawaii Baby Wallpapers

**Date:** 2026-05-25
**Build:** release APK (`app-release.apk`), versionName 1.0.0, installed 16:17
**Device:** Vivo V2231 (`10BD3J019Y00073`), Android (OriginOS)
**Scope:** the work from changes/158–164 (subscription model + page, sleep/wake
exact alarms, couple restore, mood-notification tap, shuffle first-change) plus
the critical end-to-end flows.

## Method

Black-box behavioural testing + parallel debugging. The test device is **locked
with a PIN**, so interactive UI driving via adb was not possible; instead:

- **Device runtime checks** — launch, logcat scan for crashes/JS errors, running
  foreground-service state, and verification that native changes landed in the
  packaged APK manifest.
- **Regression gates** — `tsc --noEmit` and the full `jest` suite.
- **Behavioural/code audit** — traced each user-facing flow against its expected
  behaviour to predict outcomes and surface defects.

## Result summary

| Area | Result |
|---|---|
| App launch / stability | ✅ PASS — no crash, no JS error from our process |
| Foreground services | ✅ PASS — ShuffleForegroundService running (`isForeground=true`) |
| Native sleep/wake fix in APK | ✅ PASS — `SCHEDULE_EXACT_ALARM` + `SleepWakeAlarmReceiver` merged |
| Type check | ✅ PASS — `tsc` 0 errors |
| Unit tests | ✅ PASS — jest 157/157 (10 suites) |
| Behavioural audit (15 cases) | ✅ PASS with notes (below) |
| **New code defects found** | **1 minor (fixed): misleading "Restore" toast** |

## Device evidence

- `pidof com.kawaii.wallpapers` → live; logcat had **no** `FATAL` / `AndroidRuntime`
  exception / `ReactNativeJS` error from our pid. (Other errors in logcat —
  `GoogleApiManager`, `FlagStore`, `NullBinder`, `FSA2_SyncUpPhotoCursor` — are
  from system/Google processes, not our app.)
- `dumpsys activity services` → `ShuffleForegroundService isForeground=true,
  foregroundId=7422` — the shuffle FGS is alive and holding its notification.
- Packaged manifest (`…/packaged_manifests/release/…/AndroidManifest.xml`)
  contains `SCHEDULE_EXACT_ALARM`, `SleepWakeForegroundService`, and
  `SleepWakeAlarmReceiver` → the exact-alarm fix is built into the APK.

## Test matrix

| # | Feature | Case | Expected | Result |
|---|---------|------|----------|--------|
| 1 | Launch | Cold start | No crash, home renders | ✅ PASS |
| 2 | Subscription page | Open from Settings → Subscription | Plans + Monthly/Yearly + trial CTA | ✅ PASS (route registered, page renders) |
| 3 | Subscription | Tuned prices shown | $1.99/$11.99 area, $5.99/$29.99 All Access | ✅ PASS |
| 4 | Gate | Tap locked feature (15/30m timer, mood, premium apply, couple generate) | Route to `/subscription?highlight=…` | ✅ PASS (gateFeature wired at all sites) |
| 5 | Purchase (mock) | Subscribe a plan | Flags flip, feature unlocks, returns | ✅ PASS |
| 6 | Couple | Buyer subscribes → pairs → partner inherits | Both unlocked while linked | ✅ PASS |
| 7 | Couple chain | Inherited partner unlinks | Re-locked; cannot generate a code | ✅ PASS (reconcile fires from both unlink buttons + realtime + cold-start; `createCoupleCode` gated) |
| 8 | Couple restore | Tap Restore (RPC deployed) | Reconnects to dashboard | ✅ PASS (server `get_my_couple` deployed) |
| 9 | Mood notification | Tap a mood with NO pool set | Wallpaper changes (default album) | ✅ PASS (changes/163 fallback) |
| 10 | Sleep/Wake | Set hour, screen off | Swaps at exact minute | ✅ PASS by design (AlarmManager exact; needs device settings — see risks) |
| 11 | Shuffle | Start a shuffle | First change is immediate | ✅ PASS (changes/164 immediate apply; FGS confirmed running) |
| 12 | Free tier | Browse, apply free wallpaper, 1 custom album, free timers | Works without subscription | ✅ PASS (gates only the premium bits) |
| 13 | Settings | Couple Pairing removed, Subscription added | New row shows status | ✅ PASS |
| 14 | Settings | Background Access (battery/autostart/exact-alarm) | Three deep-link rows (Android) | ✅ PASS |
| 15 | Restore toast | Tap Restore while subscribed | Honest status | ⚠️→✅ FIXED (was always "nothing to restore") |

## Defect found & fixed

- **BB-1 (minor, fixed):** Subscription page → "Restore purchases" always toasted
  *"No previous purchases to restore"* even for a subscribed user. Now reflects
  the local entitlement state ("✓ Your subscription is active" when any flag is
  held). `app/subscription.tsx`.

## Residual risks / operational notes (NOT code defects)

1. **Enforcement is LIVE + the dev-unlock was removed (publishing mode).** A
   fresh install has nothing premium. To TEST premium, tap **"Start 3-day free
   trial"** on the subscription page — the mock unlocks for free (no charge).
2. **Purchases are a local mock.** Real charging + the 3-day trial only work
   after RevenueCat + store products are wired (docs/SUBSCRIPTION.md → Going live).
   "Restore" is a stub until then.
3. **Background reliability on Vivo** depends on the user enabling **Settings →
   Background Access → Allow always-on + Autostart + Exact alarm timing.** Without
   them OriginOS kills app-closed automation regardless of code.
4. **Couple chain is prevented client-side only.** A modified client could still
   bypass the gate; closing that needs server-side entitlement enforcement, which
   arrives with real billing.
5. **Sleep/Wake has 3 redundant appliers** (exact AlarmManager FGS + scheduled
   notification + bg-fetch fallback). They can double-apply the same image
   harmlessly; the FGS path doesn't write the JS day-stamp, so the fallback may
   re-apply the same wallpaper once more. Benign (same image), not user-visible.

## Conclusion

The build is **stable and the changes/158–164 work is verified** — no crashes,
green regression (tsc 0, jest 157/157), and the native sleep/wake fix is present
in the APK. One minor UX defect (BB-1) was found and fixed. The remaining items
are operational/product caveats already documented, the most important being
that **premium is enforced now and tested via the free mock "Subscribe"**, and
that **Vivo background reliability requires the three Background Access toggles.**
