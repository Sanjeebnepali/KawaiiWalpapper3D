/**
 * Billing / subscription configuration — the single switch that decides
 * whether the Couple Premium paywall is ENFORCED.
 *
 *   SUBSCRIPTIONS_ENABLED = false  → TESTING MODE (current default).
 *     The paywall is bypassed: every gated couple action runs immediately
 *     as if the user were already subscribed. No store account, no
 *     purchase, no friction — so the couple flow (generate code → share →
 *     partner pastes → unlock) can be tested end-to-end for free.
 *
 *   SUBSCRIPTIONS_ENABLED = true   → PRODUCTION.
 *     The paywall is enforced. The first partner must hold the Couple
 *     Premium entitlement to generate a code; the second partner inherits
 *     it the moment they accept that code (one subscription covers the
 *     couple and lasts until it ends — no second purchase, and no repeat
 *     prompts while it's active).
 *
 * This flag lives off to the side ON PURPOSE: flipping subscriptions on for
 * production is a one-line change here and touches nothing in the feature
 * code. Wiring the real purchase (RevenueCat / Play Billing) happens in
 * `lib/billing.ts:purchaseCouplePremium` — again without touching any gate
 * call site.
 */
export const SUBSCRIPTIONS_ENABLED = false;
