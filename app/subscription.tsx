import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../components/AnimatedButton';
import { BillingToggle } from '../components/subscription/BillingToggle';
import { PlanRow } from '../components/subscription/PlanRow';
import {
  ALL_ACCESS,
  formatPrice,
  PLANS,
  type Plan,
  planPrice,
} from '../constants/plans';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  type BillingPeriod,
  devUnlockAll,
  type PlanId,
  purchasePlans,
} from '../lib/billing';
import { toast } from '../lib/toast';
import { useSettingsStore } from '../store/settings';

const ALL_PLAN_IDS: PlanId[] = [...PLANS.map((p) => p.id), ALL_ACCESS.id];

/**
 * Subscription page — the single "payment option" reached from Settings and
 * from every premium gate (`gateFeature` routes here with `?highlight=<area>`).
 *
 * Checkboxes let the user buy any subset of the four areas à la carte OR the
 * All Access bundle, billed Monthly or Yearly. "Subscribe" runs the mock
 * purchase (`purchasePlans`) which flips the local entitlement flags — the
 * RevenueCat seam (see docs/SUBSCRIPTION_ARCHITECTURE.md).
 */
export default function SubscriptionScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();

  // Raw flags (not `hasEntitlement`, which short-circuits in testing mode) so
  // the "Owned" badges reflect what the user actually purchased.
  const savedPeriod = useSettingsStore((s) => s.billingPeriod);
  const allAccess = useSettingsStore((s) => s.allAccess);
  const entThemePacks = useSettingsStore((s) => s.entThemePacks);
  const entMood = useSettingsStore((s) => s.entMood);
  const entCollection = useSettingsStore((s) => s.entCollection);
  const isCouplePremium = useSettingsStore((s) => s.isCouplePremium);

  const [period, setPeriod] = useState<BillingPeriod>(savedPeriod);
  const [selected, setSelected] = useState<Set<PlanId>>(() =>
    typeof highlight === 'string' && ALL_PLAN_IDS.includes(highlight as PlanId)
      ? new Set<PlanId>([highlight as PlanId])
      : new Set<PlanId>(),
  );

  const owns = (id: PlanId): boolean => {
    if (id === 'allAccess') return allAccess;
    if (allAccess) return true;
    if (id === 'themePacks') return entThemePacks;
    if (id === 'mood') return entMood;
    if (id === 'collection') return entCollection;
    return isCouplePremium; // 'couple'
  };

  const toggle = (id: PlanId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // All Access supersedes the à la carte rows; the two can't combine.
        if (id === 'allAccess') PLANS.forEach((p) => next.delete(p.id));
        else next.delete('allAccess');
      }
      return next;
    });
  };

  const priceLabel = (plan: Plan) =>
    `${formatPrice(planPrice(plan, period))}${period === 'monthly' ? '/mo' : '/yr'}`;

  const total = useMemo(() => {
    if (selected.has('allAccess')) return planPrice(ALL_ACCESS, period);
    return PLANS.filter((p) => selected.has(p.id)).reduce(
      (sum, p) => sum + planPrice(p, period),
      0,
    );
  }, [selected, period]);

  // Only count plans the user doesn't already own — re-buying is a no-op.
  const buyable = [...selected].filter((id) => !owns(id));
  const canSubscribe = buyable.length > 0;

  const onSubscribe = () => {
    if (!canSubscribe) return;
    purchasePlans(buyable, period);
    toast('✓ Subscribed — premium unlocked');
    router.back();
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top', 'bottom']}
    >
      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Subscription
        </Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Unlock premium areas. Buy any on their own, or get{' '}
          <Text style={{ color: theme.primary, fontWeight: '800' }}>
            All Access
          </Text>{' '}
          for everything.
        </Text>

        <BillingToggle value={period} onChange={setPeriod} accent={theme.primary} />

        <View style={styles.list}>
          {PLANS.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              priceLabel={priceLabel(plan)}
              checked={selected.has(plan.id)}
              owned={owns(plan.id)}
              accent={theme.primary}
              onToggle={() => toggle(plan.id)}
            />
          ))}
        </View>

        <Text style={styles.divider}>— or —</Text>

        <PlanRow
          plan={ALL_ACCESS}
          priceLabel={priceLabel(ALL_ACCESS)}
          checked={selected.has('allAccess')}
          owned={owns('allAccess')}
          highlight
          accent={theme.primary}
          onToggle={() => toggle('allAccess')}
        />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, { color: theme.text }]}>
            {formatPrice(total)}
            <Text style={styles.totalPer}>
              {period === 'monthly' ? '/mo' : '/yr'}
            </Text>
          </Text>
        </View>

        <AnimatedButton
          onPress={onSubscribe}
          style={[
            styles.cta,
            { backgroundColor: canSubscribe ? theme.primary : Colors.surfaceHi },
          ]}
        >
          <Text
            style={[
              styles.ctaText,
              { color: canSubscribe ? '#131313' : Colors.textMute },
            ]}
          >
            {canSubscribe ? 'Subscribe' : 'Select a plan'}
          </Text>
        </AnimatedButton>

        <AnimatedButton
          onPress={() => toast('No previous purchases to restore')}
          style={styles.restore}
        >
          <Text style={styles.restoreText}>Restore purchases</Text>
        </AnimatedButton>

        {__DEV__ ? (
          <AnimatedButton
            onPress={() => {
              devUnlockAll();
              toast('Dev: All Access unlocked');
              router.back();
            }}
            style={styles.devBtn}
          >
            <Text style={styles.devText}>Dev: unlock All Access (free)</Text>
          </AnimatedButton>
        ) : null}

        <Text style={styles.legal}>
          Placeholder pricing. Subscriptions are simulated locally in this
          build — no charge is made. Real billing (auto-renewing, cancel
          anytime) is wired before launch.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  scroll: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: Spacing.xxl },
  intro: {
    fontSize: 13,
    color: Colors.textDim,
    lineHeight: 19,
    marginBottom: Spacing.xs,
  },
  list: { gap: Spacing.sm },
  divider: {
    textAlign: 'center',
    color: Colors.textMute,
    fontSize: 12,
    fontWeight: '700',
    marginVertical: Spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textDim },
  totalValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  totalPer: { fontSize: 13, fontWeight: '700', color: Colors.textDim },
  cta: {
    paddingVertical: 16,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xs,
  },
  ctaText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  restore: { alignItems: 'center', paddingVertical: Spacing.sm },
  restoreText: { color: Colors.textDim, fontSize: 13, fontWeight: '700' },
  devBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  devText: { color: Colors.textMute, fontSize: 12, fontWeight: '700' },
  legal: {
    fontSize: 10.5,
    color: Colors.textMute,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
