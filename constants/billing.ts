/**
 * Billing / subscription configuration — the single switch that decides
 * whether the premium paywall is ENFORCED across the whole app.
 *
 *   SUBSCRIPTIONS_ENABLED = true   → PUBLISHING / ENFORCED (monetization on).
 *     Every premium gate locks. Tapping a locked feature routes to the
 *     subscription page (`app/subscription.tsx`), where the four à la carte
 *     areas (theme packs, mood, premium collection, couple) and the All Access
 *     bundle each unlock independently after a 3-day free trial.
 *
 *   SUBSCRIPTIONS_ENABLED = false  → FREE LAUNCH (current default).
 *     The paywall is bypassed: `hasEntitlement`/`useEntitlement` return true
 *     for everything, so every feature is unlocked for free, premium badges
 *     are hidden, and the Settings "Subscription" row is hidden.
 *
 * DECISION (2026-05-29): ship the app FREE to grow the install base, then flip
 * to subscriptions once we hit a stable ~1000 downloads. The whole billing
 * stack — subscription page, entitlement flags, mock purchase, couple
 * buyer/partner rule, RevenueCat seam — stays in place; re-arming monetization
 * is JUST flipping this one line back to `true`.
 *
 * Toggling enforcement is a one-line change here and touches nothing in the
 * feature code. IMPORTANT: real charging + the 3-day trial are NOT active until
 * the purchase is wired to RevenueCat / Play Billing in `lib/billing.ts`
 * (`purchasePlans`) and the subscription products are configured in the store.
 * Until then "Subscribe" unlocks locally (no charge). See docs/SUBSCRIPTION.md.
 */
export const SUBSCRIPTIONS_ENABLED = false;
