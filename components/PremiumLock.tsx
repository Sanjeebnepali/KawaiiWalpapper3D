import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../constants/theme';
import { hasCouplePremium, purchaseCouplePremium } from '../lib/billing';
import { useSettingsStore } from '../store/settings';
import { premiumAlert } from './PremiumAlert';

/* ───────────────────────────────────────────────────────────────────────────
 * OPEN PAYWALL — INTENTIONAL TEST STUB (H1). MUST be flipped to `false` (and
 * the unlock rewired to a real purchase) BEFORE public launch.
 *
 * While `true`, the regular-Premium paywall's confirm button grants the
 * `isPremium` entitlement for FREE — no payment, no store sandbox. This is a
 * DELIBERATE owner decision so QA / the developer can exercise every gated
 * flow without RevenueCat wired up. It is NOT a bug.
 *
 * TODO(billing): before public launch, set DEV_FREE_UNLOCK = false and replace
 * the unlock below with `Purchases.presentPaywall()` (RevenueCat — changes/021
 * Phase 2). Leaving this `true` in production ships premium for free.
 * ─────────────────────────────────────────────────────────────────────────── */
const DEV_FREE_UNLOCK = true;

/**
 * Small "💎 Premium" pill, used to mark locked rows in the shuffle screens.
 * The actual gate is enforced in the parent's `onPress` via `gatePremium()`.
 */
export function PremiumLock({ size = 11 }: { size?: number }) {
  return (
    <View style={styles.pill}>
      <Ionicons name="diamond" size={size} color={Colors.gold} />
      <Text style={[styles.pillText, { fontSize: size + 1 }]}>Premium</Text>
    </View>
  );
}

/**
 * Premium gate helper.
 *
 * Phase 1: the `premium` entitlement is a local boolean in `settings.isPremium`.
 * `gatePremium(action)` runs `action` if the user is premium, otherwise pops
 * a paywall Alert. The Alert's "Upgrade (dev)" button flips the flag so
 * QA / the developer can exercise gated flows without a store sandbox.
 *
 * Phase 2 will swap this for `Purchases.getCustomerInfo()` + an in-app
 * paywall screen. Call sites don't change.
 */
export function gatePremium(onUnlock: () => void): void {
  const { isPremium, set } = useSettingsStore.getState();
  if (isPremium) {
    onUnlock();
    return;
  }
  premiumAlert({
    title: 'Premium feature',
    message:
      'Upgrade to Premium to unlock unlimited collections, faster timers, and smart shuffle modes.',
    icon: 'diamond',
    accentColor: Colors.gold,
    buttons: [
      { text: 'Not now', style: 'cancel' },
      {
        // INTENTIONAL OPEN PAYWALL (H1) — gated by the DEV_FREE_UNLOCK flag
        // at the top of this file. While that flag is `true`, this confirm
        // button grants Premium for FREE so QA can test gated flows without
        // RevenueCat. This is an owner-approved test stub, NOT a leak to fix.
        // Before public launch: flip DEV_FREE_UNLOCK to false and swap this
        // for `Purchases.presentPaywall()`.
        text: 'Upgrade (dev)',
        onPress: () => {
          if (DEV_FREE_UNLOCK) {
            set('isPremium', true);
            onUnlock();
          }
          // When DEV_FREE_UNLOCK is false this becomes a no-op until the real
          // RevenueCat purchase flow is wired in (TODO(billing) above).
        },
      },
    ],
  });
}

/**
 * Couple Premium gate — separate SKU from regular Premium. Used by the
 * Couple page to gate the "Generate code" action: per the product spec,
 * only subscribers can issue a code, and the partner inherits the perk
 * automatically the moment they accept it (`lib/couple.ts:acceptCoupleCode`
 * flips `isCouplePremium` true on the accepting side).
 *
 * Entitlement + testing/production switch live in `lib/billing.ts`:
 *   - Testing mode (`SUBSCRIPTIONS_ENABLED = false`) → `hasCouplePremium()`
 *     is always true, so this gate is transparent and the action runs.
 *   - Production → the paywall below shows; "Subscribe" runs the real
 *     purchase via `purchaseCouplePremium()` and then proceeds.
 */
export function gateCouplePremium(onUnlock: () => void): void {
  if (hasCouplePremium()) {
    onUnlock();
    return;
  }
  premiumAlert({
    title: 'Couple Premium',
    message:
      'Subscribe to Couple Premium to generate your couple code. Your partner unlocks Couple Premium automatically the moment they enter your code — one subscription covers you both, until it ends.',
    icon: 'heart',
    accentColor: Colors.gold,
    buttons: [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Subscribe',
        onPress: async () => {
          const r = await purchaseCouplePremium();
          if (r.ok) onUnlock();
        },
      },
    ],
  });
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(232,194,117,0.08)',
  },
  pillText: {
    color: Colors.gold,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
