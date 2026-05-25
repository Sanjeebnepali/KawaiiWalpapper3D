import { Ionicons } from '@expo/vector-icons';
import type { BillingPeriod, PlanId } from '../lib/billing';

/**
 * Subscription plan catalog — the four à la carte areas plus the All Access
 * bundle, shown on `app/subscription.tsx`.
 *
 * PRICES ARE PLACEHOLDERS. Edit them freely. When real billing is wired the
 * page should read the localized price STRING off the RevenueCat offering
 * (`pkg.product.priceString`) instead of these numbers — see
 * docs/SUBSCRIPTION.md. The `id`s map 1:1 to entitlement flags in
 * `lib/billing.purchasePlans`, so don't rename them without updating that.
 */

type IoniconName = keyof typeof Ionicons.glyphMap;

export type Plan = {
  id: PlanId;
  title: string;
  blurb: string;
  icon: IoniconName;
  /** Placeholder USD price per cadence. */
  monthly: number;
  yearly: number;
};

export const CURRENCY = '$';

/**
 * Free-trial length shown on the subscription page. The ACTUAL trial is
 * configured on the store product (Play Console / App Store) / RevenueCat at
 * go-live — this constant only drives the UI copy ("Start 3-day free trial").
 */
export const TRIAL_DAYS = 3;

/** The four à la carte areas, in display order. */
export const PLANS: Plan[] = [
  {
    id: 'themePacks',
    title: 'Theme Packs',
    blurb: 'Custom albums + 15/30 min & custom shuffle timers',
    icon: 'albums',
    monthly: 1.99,
    yearly: 11.99,
  },
  {
    id: 'mood',
    title: 'Mood Themes',
    blurb: 'Auto mood-based wallpapers + every mood feature',
    icon: 'happy',
    monthly: 1.99,
    yearly: 11.99,
  },
  {
    id: 'collection',
    title: 'Premium Collection',
    blurb: '60 exclusive premium wallpapers',
    icon: 'diamond',
    monthly: 1.99,
    yearly: 11.99,
  },
  {
    id: 'couple',
    title: 'Couple Theme',
    blurb: 'Paired wallpapers — share one code, both unlock',
    icon: 'heart',
    monthly: 1.99,
    yearly: 11.99,
  },
];

/** All-in-one bundle — grants all four areas at once. */
export const ALL_ACCESS: Plan = {
  id: 'allAccess',
  title: 'All Access',
  blurb: 'Everything above, one subscription',
  icon: 'infinite',
  monthly: 5.99,
  yearly: 29.99,
};

/** Price for a plan at the chosen cadence. */
export function planPrice(plan: Plan, period: BillingPeriod): number {
  return period === 'monthly' ? plan.monthly : plan.yearly;
}

/** Format a USD amount like "$1.99". */
export function formatPrice(amount: number): string {
  return `${CURRENCY}${amount.toFixed(2)}`;
}
