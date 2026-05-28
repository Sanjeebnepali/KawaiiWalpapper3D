import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SUBSCRIPTIONS_ENABLED } from '../constants/billing';
import { Colors, Radius } from '../constants/theme';
import { hasEntitlement, type PremiumFeature } from '../lib/billing';

/**
 * Small "💎 Premium" pill, used to mark locked rows/options in the shuffle,
 * mood and theme-pack screens. The actual gate is enforced in the parent's
 * `onPress` via `gateFeature()` — this is purely the visual lock badge.
 *
 * In free-launch mode (`SUBSCRIPTIONS_ENABLED = false`) nothing is locked, so
 * the badge renders nothing. This single guard covers every badge — including
 * the unconditional ones on the Couple tab and Mood camera — without each call
 * site needing its own check; they reappear the moment monetization flips on.
 */
export function PremiumLock({ size = 11 }: { size?: number }) {
  if (!SUBSCRIPTIONS_ENABLED) return null;
  return (
    <View style={styles.pill}>
      <Ionicons name="diamond" size={size} color={Colors.gold} />
      <Text style={[styles.pillText, { fontSize: size + 1 }]}>Premium</Text>
    </View>
  );
}

/**
 * Premium gate. If the user already owns `feature`, runs `onUnlock` now.
 * Otherwise it routes to the subscription page with that plan pre-highlighted
 * — the standard "tap a locked feature → paywall" flow. The deferred action is
 * NOT auto-resumed across the navigation: after subscribing the user returns
 * and taps the feature again (matches how every store paywall behaves).
 *
 * `feature` decides BOTH the entitlement checked and which plan the page opens
 * highlighted, so the four à la carte areas gate independently.
 */
export function gateFeature(
  feature: PremiumFeature,
  onUnlock: () => void,
): void {
  if (hasEntitlement(feature)) {
    onUnlock();
    return;
  }
  // Cast: `/subscription` isn't in expo-router's generated route union until
  // Metro regenerates `.expo/types` (typedRoutes gotcha — see CLAUDE.md).
  router.push({
    pathname: '/subscription',
    params: { highlight: feature },
  } as Href);
}

/** Couple Theme gate — convenience wrapper preserved for `app/couple/setup`. */
export function gateCouplePremium(onUnlock: () => void): void {
  gateFeature('couple', onUnlock);
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
