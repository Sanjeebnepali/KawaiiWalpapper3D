# Drop subscriptions for a free launch (one-switch path back)

**Date:** 2026-05-29
**Type:** feature / config

## Problem

The app ships with the paywall ENFORCED (`SUBSCRIPTIONS_ENABLED = true`, change
158): the four premium areas (theme packs, mood, premium collection, couple) and
the All Access bundle all lock behind the subscription page. The owner decided to
**launch the app FREE** to grow the install base first, then switch on
subscriptions once it reaches a stable ~1000 downloads. The requirement: make
everything free now WITHOUT deleting the billing stack, so re-arming
monetization later is a trivial, low-risk flip — not a re-implementation.

## Solution

The billing architecture (change 158) was already built around a single master
switch, so "free now / paid later" is exactly the seam it was designed for. Three
minimal edits; **zero billing logic removed**.

1. **`constants/billing.ts` — `SUBSCRIPTIONS_ENABLED = true → false`.** This one
   line is load-bearing: `hasEntitlement`/`useEntitlement` (`lib/billing.ts`)
   short-circuit to `true` for every area, so every gate passes and
   `gateFeature` (`components/PremiumLock.tsx`) runs the action immediately
   instead of routing to the subscription page. Doc comment updated to record the
   decision and the "flip back to `true` to monetize" path.

2. **`components/PremiumLock.tsx` — badge renders `null` when subscriptions are
   off.** Most `<PremiumLock />` badges were already gated on the per-area
   entitlement (`!hasMood`, `m.premium && !hasThemePacks`, …), which now resolves
   to "entitled" and hides them automatically. But two were UNCONDITIONAL —
   `app/mood/camera.tsx:149` and `app/(tabs)/couple.tsx:149`. Guarding inside the
   component (`if (!SUBSCRIPTIONS_ENABLED) return null;`) hides every badge from
   one place, including those two and any added later, with no per-call-site
   change. They reappear the moment the flag flips on.

3. **`app/(tabs)/profile.tsx` — hide the Settings "Subscription" section in free
   mode.** Wrapped the `SettingsSection` in `{SUBSCRIPTIONS_ENABLED && (…)}`.
   With the badges gone and `gateFeature` no longer navigating, the subscription
   page is naturally unreachable in free mode, so the route is left registered
   (harmless) rather than deleted.

**Untouched and ready to re-arm:** `lib/billing.ts` (entitlement reads, grant /
reconcile / mock purchase, RevenueCat seam), `app/subscription.tsx`, the per-area
settings flags + couple `coupleSource`, the couple buyer/partner unlink rule, and
`constants/plans.ts` pricing. **To monetize later: set `SUBSCRIPTIONS_ENABLED =
true` in `constants/billing.ts` — that is the entire change.** (Real charging
still additionally requires wiring `purchasePlans` to RevenueCat / Play Billing,
unchanged from change 158.)

## Files changed

- `constants/billing.ts` — `SUBSCRIPTIONS_ENABLED = false`; doc comment records the free-launch decision + flip-back path.
- `components/PremiumLock.tsx` — `PremiumLock` returns `null` when `!SUBSCRIPTIONS_ENABLED` (hides all premium badges incl. the unconditional Couple/Mood-camera ones); imports the flag.
- `app/(tabs)/profile.tsx` — Settings "Subscription" section gated behind `SUBSCRIPTIONS_ENABLED`; imports the flag.

## Verification

- `npx tsc --noEmit` → **exit 0** (no errors; the `false` literal doesn't trip
  unreachable-code since `allowUnreachableCode` isn't enabled).
- `npx jest` → **203 passed / 13 suites**. `lib/__tests__/billing.test.ts`
  already branches on `SUBSCRIPTIONS_ENABLED` (the `hasEntitlement` cases take the
  bypass path; grant/reconcile/purchase are switch-independent), so flipping the
  flag keeps the suite green.

## Notes

- **No native rebuild required** — JS/TS-only change; a `run` just re-embeds the
  bundle.
- Entitlement *flags* a user already holds (from the mock purchase) are left
  in `store/settings.ts` untouched; they're simply not consulted while the gate
  short-circuits, and resume meaning if monetization is re-enabled.
- iOS unaffected by this change specifically, but note the broader platform
  reality: the app's auto-apply features are Android-only regardless of billing.
