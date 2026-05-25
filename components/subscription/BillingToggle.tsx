import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../../constants/theme';
import type { BillingPeriod } from '../../lib/billing';
import { AnimatedButton } from '../AnimatedButton';

/**
 * Monthly / Yearly segmented control for the subscription page. Purely
 * presentational — the parent owns the selected period and the prices.
 */
export function BillingToggle({
  value,
  onChange,
  accent,
}: {
  value: BillingPeriod;
  onChange: (period: BillingPeriod) => void;
  accent: string;
}) {
  return (
    <View style={styles.wrap}>
      {(['monthly', 'yearly'] as const).map((p) => {
        const active = p === value;
        return (
          <AnimatedButton
            key={p}
            onPress={() => onChange(p)}
            style={[styles.seg, active && { backgroundColor: accent }]}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? '#131313' : Colors.textDim },
              ]}
            >
              {p === 'monthly' ? 'Monthly' : 'Yearly'}
            </Text>
            {p === 'yearly' ? (
              <Text
                style={[
                  styles.badge,
                  { color: active ? '#131313' : Colors.gold },
                ]}
              >
                Best value
              </Text>
            ) : null}
          </AnimatedButton>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.pill,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: Radius.pill,
  },
  segText: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  badge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },
});
