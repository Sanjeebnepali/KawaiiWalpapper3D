/**
 * Billing / subscription configuration — the single switch that decides
 * whether the premium paywall is ENFORCED across the whole app.
 *
 *   SUBSCRIPTIONS_ENABLED = true   → PRODUCTION / ENFORCED (current default).
 *     Every premium gate locks. Tapping a locked feature routes to the
 *     subscription page (`app/subscription.tsx`). The four à la carte areas
 *     (theme packs, mood, premium collection, couple) and the All Access
 *     bundle each unlock independently. A `__DEV__`-only "dev unlock" button
 *     on that page still grants All Access for free so QA can exercise every
 *     gated flow without a store sandbox (see `lib/billing.devUnlockAll`).
 *
 *   SUBSCRIPTIONS_ENABLED = false  → TESTING MODE.
 *     The paywall is bypassed: `hasEntitlement`/`useEntitlement` return true
 *     for everything, so every gated action runs immediately as if subscribed.
 *
 * This flag lives off to the side ON PURPOSE: toggling enforcement is a
 * one-line change here and touches nothing in the feature code. Wiring the
 * real purchase (RevenueCat / Play Billing) happens in `lib/billing.ts`
 * (`purchasePlans`) — again without touching any gate call site. See
 * docs/SUBSCRIPTION_ARCHITECTURE.md.
 */
export const SUBSCRIPTIONS_ENABLED = true;
