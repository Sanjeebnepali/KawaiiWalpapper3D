# Publishing mode: 3-day trial, tuned pricing, doc merge

**Date:** 2026-05-25
**Type:** feature

## Problem

After reviewing growth options the owner dropped the "share-to-3-to-unlock"
referral idea (it was only ever discussed, never built — and it risked App Store
rejection under guideline 3.2.2 + friction). The decision: a **3-day free trial
of everything, then paid**, with **research-tuned pricing**, the app switched to
**publishing mode** (no longer test mode), the dev-only bits removed, and the
three separate subscription docs **merged into one**.

## Solution

- **Pricing tuned per market research** (`constants/plans.ts`): per-area now
  **$1.99/mo · $11.99/yr**; All Access **$5.99/mo · $29.99/yr** (≈50% off
  annual). Added `TRIAL_DAYS = 3` (drives UI copy; the real trial is configured
  on the store product at go-live).
- **3-day trial in the UI** (`app/subscription.tsx`): the CTA reads
  **"Start 3-day free trial"**, a note shows "Free for 3 days, then {total}/…,
  cancel anytime", and the footer is production copy (auto-renew / cancel in
  store). Removed the `__DEV__` dev-unlock button.
- **Publishing mode**: `SUBSCRIPTIONS_ENABLED` stays `true` (enforced); the
  `constants/billing.ts` doc reframed for publishing + a clear caveat that real
  charging needs RevenueCat. Removed the now-redundant `lib/billing.devUnlockAll`.
- **Docs merged**: `docs/SUBSCRIPTION_ARCHITECTURE.md` +
  `docs/SUBSCRIPTION_DIAGRAMS.md` + `docs/MARKET_RESEARCH_SUBSCRIPTION.md` →
  **one** `docs/SUBSCRIPTION.md` (Summary + Rules + master flow chart + couple
  state diagram + Going-live steps + condensed research). The three split files
  were deleted.

**Caveat (carried in `SUBSCRIPTION.md`):** purchases are still a **local mock** —
"Subscribe" unlocks locally with no charge. Real money + the trial only activate
once `purchasePlans` is wired to RevenueCat / Play Billing and the subscription
products (with a 3-day intro offer) are created in the store. A **Lifetime All
Access** tier is documented as a recommended future addition (not yet built).

## Files changed

- `constants/plans.ts` — tuned prices; added `TRIAL_DAYS`; doc link.
- `app/subscription.tsx` — trial CTA + note + production footer; removed dev-unlock button + unused styles.
- `lib/billing.ts` — removed `devUnlockAll`; doc link.
- `constants/billing.ts` — publishing-mode doc + RevenueCat caveat.
- `docs/SUBSCRIPTION.md` — **new**, consolidated.
- Deleted: `docs/SUBSCRIPTION_ARCHITECTURE.md`, `docs/SUBSCRIPTION_DIAGRAMS.md`, `docs/MARKET_RESEARCH_SUBSCRIPTION.md`.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npx jest` → all green (billing tests unaffected; `devUnlockAll` was untested).

## Notes

- Changelog entries 158–160 still link to the now-merged docs — left as the
  historical record; `docs/SUBSCRIPTION.md` is the live reference.
- No native rebuild needed for these JS/doc changes; wiring RevenueCat later DOES
  need a rebuild.
