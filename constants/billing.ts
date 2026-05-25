/**
 * Billing / subscription configuration — the single switch that decides
 * whether the premium paywall is ENFORCED across the whole app.
 *
 *   SUBSCRIPTIONS_ENABLED = true   → PUBLISHING / ENFORCED (current default).
 *     Every premium gate locks. Tapping a locked feature routes to the
 *     subscription page (`app/subscription.tsx`), where the four à la carte
 *     areas (theme packs, mood, premium collection, couple) and the All Access
 *     bundle each unlock independently after a 3-day free trial.
 *
 *   SUBSCRIPTIONS_ENABLED = false  → QA / TESTING.
 *     The paywall is bypassed: `hasEntitlement`/`useEntitlement` return true
 *     for everything, so gated actions run immediately. Use this to exercise
 *     gated flows without going through the (mock) purchase.
 *
 * Toggling enforcement is a one-line change here and touches nothing in the
 * feature code. IMPORTANT: real charging + the 3-day trial are NOT active until
 * the purchase is wired to RevenueCat / Play Billing in `lib/billing.ts`
 * (`purchasePlans`) and the subscription products are configured in the store.
 * Until then "Subscribe" unlocks locally (no charge). See docs/SUBSCRIPTION.md.
 */
export const SUBSCRIPTIONS_ENABLED = true;
