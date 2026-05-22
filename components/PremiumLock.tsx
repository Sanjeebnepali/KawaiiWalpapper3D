import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../constants/theme';
import { hasCouplePremium, purchaseCouplePremium } from '../lib/billing';
import { useSettingsStore } from '../store/settings';
import { premiumAlert } from './PremiumAlert';

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
        // Dev unlock — replace with `Purchases.presentPaywall()` once
        // RevenueCat is wired (changes/021 Phase 2 notes).
        text: 'Upgrade (dev)',
        onPress: () => {
          set('isPremium', true);
          onUnlock();
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
