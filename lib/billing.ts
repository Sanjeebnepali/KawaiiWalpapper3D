import { SUBSCRIPTIONS_ENABLED } from '../constants/billing';
import { useSettingsStore } from '../store/settings';

/**
 * Couple Premium entitlement — the parallel billing layer.
 *
 * Everything that needs to know "may this user use a paid couple feature
 * right now?" goes through `hasCouplePremium()`. It is the ONLY place that
 * combines the testing/production switch (`SUBSCRIPTIONS_ENABLED`) with the
 * persisted entitlement, so the feature code never branches on the mode
 * itself.
 *
 *   testing  (SUBSCRIPTIONS_ENABLED = false) → always true.
 *   production (true) → the persisted `settings.isCouplePremium`, which is
 *     set by a real purchase OR inherited when a partner accepts a code
 *     (`lib/couple.ts:acceptCoupleCode`). It survives unlink and app
 *     restarts (the entitlement lasts until the subscription ends).
 */
export function hasCouplePremium(): boolean {
  if (!SUBSCRIPTIONS_ENABLED) return true;
  return useSettingsStore.getState().isCouplePremium;
}

/**
 * Begin (and, for now, complete) a Couple Premium purchase.
 *
 * PRODUCTION TODO: replace the body with the real purchase —
 *   const { customerInfo } = await Purchases.purchasePackage(pkg);
 *   return { ok: customerInfo.entitlements.active['couple_premium'] != null };
 * and read the entitlement back rather than writing the flag here. The
 * call sites (the paywall's "Subscribe" button) don't change.
 *
 * Until that's wired we optimistically grant the local entitlement so the
 * post-purchase flow (code reveal → share → partner accept) is exercisable.
 */
export async function purchaseCouplePremium(): Promise<{ ok: boolean }> {
  useSettingsStore.getState().set('isCouplePremium', true);
  return { ok: true };
}
