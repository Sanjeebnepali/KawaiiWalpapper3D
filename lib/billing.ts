import { SUBSCRIPTIONS_ENABLED } from '../constants/billing';
import { useSettingsStore, type SettingsState } from '../store/settings';

/**
 * Billing / entitlements — the single source of truth for "may this user use
 * a paid feature right now?".
 *
 * The app sells FOUR independently-purchasable premium areas plus an
 * "All Access" bundle (see `constants/plans.ts`):
 *
 *   themePacks  → custom shuffle albums + 15/30/custom timers + smart shuffle
 *   mood        → all mood-based features
 *   collection  → the 60-image premium wallpaper collection
 *   couple      → couple theme + code sharing (special unlink rule, below)
 *
 * Every gate reads through `hasEntitlement` (imperative) or `useEntitlement`
 * (reactive). They are the ONLY place that combines the enforce/testing switch
 * (`SUBSCRIPTIONS_ENABLED`) with the persisted flags, so feature code never
 * branches on the mode itself.
 *
 *   testing  (SUBSCRIPTIONS_ENABLED = false) → every feature unlocked.
 *   enforced (true, the default) → All Access OR the per-area flag.
 *
 * The WRITE path (`purchasePlans`) is a local mock today. Wiring real billing
 * (RevenueCat / Play Billing) replaces ONLY that body — it reads the granted
 * entitlements back off `customerInfo` instead of writing the flags directly.
 * No gate call site changes. See docs/SUBSCRIPTION_ARCHITECTURE.md.
 */

/** The four independently-purchasable premium areas. */
export type PremiumFeature = 'themePacks' | 'mood' | 'collection' | 'couple';

/** A buyable line item on the subscription page: a single area or the bundle. */
export type PlanId = PremiumFeature | 'allAccess';

/** Billing cadence offered on the subscription page. */
export type BillingPeriod = 'monthly' | 'yearly';

/** Which settings flag grants each area (couple keeps its legacy name). */
function ownsFeature(s: SettingsState, feature: PremiumFeature): boolean {
  switch (feature) {
    case 'themePacks':
      return s.entThemePacks;
    case 'mood':
      return s.entMood;
    case 'collection':
      return s.entCollection;
    case 'couple':
      return s.isCouplePremium;
  }
}

/**
 * Imperative entitlement check — for non-React code (background tasks,
 * bootstrap, event-handler closures). When enforcement is off every feature
 * is unlocked; otherwise All Access OR the per-area flag grants it.
 */
export function hasEntitlement(feature: PremiumFeature): boolean {
  if (!SUBSCRIPTIONS_ENABLED) return true;
  const s = useSettingsStore.getState();
  return s.allAccess || ownsFeature(s, feature);
}

/**
 * Reactive entitlement check — for components that must re-render the moment
 * the user subscribes. Subscribes only to the slices it reads.
 */
export function useEntitlement(feature: PremiumFeature): boolean {
  return useSettingsStore(
    (s) => !SUBSCRIPTIONS_ENABLED || s.allAccess || ownsFeature(s, feature),
  );
}

/** Back-compat alias — the Couple Theme entitlement specifically. */
export function hasCouplePremium(): boolean {
  return hasEntitlement('couple');
}

// ─── Couple entitlement: grant + unlink reconciliation ─────────────────────

/**
 * Grant the Couple Theme entitlement, recording WHY so the unlink rule can
 * later decide whether to keep or revoke it:
 *
 *   'purchased' — bought on the subscription page (or held via All Access).
 *   'inherited' — unlocked by entering a partner's code.
 *
 * A real purchase is never downgraded to 'inherited': a buyer who also accepts
 * a code stays a 'purchased' holder and keeps the perk after any unlink.
 */
export function grantCoupleEntitlement(
  source: 'purchased' | 'inherited',
): void {
  const s = useSettingsStore.getState();
  s.set('isCouplePremium', true);
  const stayPurchased =
    source === 'inherited' && (s.coupleSource === 'purchased' || s.allAccess);
  if (!stayPurchased) s.set('coupleSource', source);
}

/**
 * Reconcile the Couple Theme entitlement against the current link state.
 * Called on unlink — on the device that initiates it (`lib/couple.unlinkCouple`)
 * AND on the partner's side via the realtime `status → unlinked` handler and
 * cold-start hydration.
 *
 *   - Still linked            → nothing to do.
 *   - All Access / purchased  → kept (the buyer paid for it).
 *   - Inherited via a code    → revoked the instant the pair ends, so the
 *                               non-buyer must subscribe themselves (or join
 *                               another buyer) to use it again. This is the
 *                               product rule: one subscription unlocks one
 *                               partner at a time.
 */
export function reconcileCoupleEntitlement(isLinked: boolean): void {
  if (isLinked) return;
  const s = useSettingsStore.getState();
  if (s.allAccess) return;
  if (s.coupleSource === 'inherited') {
    s.set('isCouplePremium', false);
    s.set('coupleSource', null);
  }
}

// ─── Purchase (mock) ───────────────────────────────────────────────────────

/**
 * Mock purchase — grant the chosen plans locally and record the billing
 * cadence. This is the RevenueCat seam: a real build runs
 * `Purchases.purchasePackage(pkg)` then re-reads `customerInfo.entitlements`
 * instead of writing these flags. Buying 'couple' (or 'allAccess') marks the
 * couple source 'purchased' so it survives unlink.
 */
export function purchasePlans(planIds: PlanId[], period: BillingPeriod): void {
  const s = useSettingsStore.getState();
  s.set('billingPeriod', period);
  for (const id of planIds) {
    switch (id) {
      case 'allAccess':
        s.set('allAccess', true);
        break;
      case 'themePacks':
        s.set('entThemePacks', true);
        break;
      case 'mood':
        s.set('entMood', true);
        break;
      case 'collection':
        s.set('entCollection', true);
        break;
      case 'couple':
        grantCoupleEntitlement('purchased');
        break;
    }
  }
}

/**
 * DEV-only escape hatch (the "enforce gates but keep a dev unlock" decision).
 * Grants All Access for free so QA can exercise every gated flow without a
 * store sandbox. Surfaced on the subscription page behind `__DEV__`. NOT a
 * purchase — leaves the billing period untouched.
 */
export function devUnlockAll(): void {
  useSettingsStore.getState().set('allAccess', true);
}
