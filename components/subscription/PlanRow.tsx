import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { Plan } from '../../constants/plans';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { AnimatedButton } from '../AnimatedButton';

/**
 * One selectable plan row on the subscription page: icon + title + blurb on
 * the left, and on the right either an "Owned" pill (already entitled) or the
 * price + a checkbox. Tapping toggles selection; owned rows are inert.
 *
 * `highlight` gives the All Access bundle a tinted accent border so it reads
 * as the headline option.
 */
export function PlanRow({
  plan,
  priceLabel,
  checked,
  owned,
  highlight,
  accent,
  onToggle,
}: {
  plan: Plan;
  priceLabel: string;
  checked: boolean;
  owned: boolean;
  highlight?: boolean;
  accent: string;
  onToggle: () => void;
}) {
  return (
    <AnimatedButton
      onPress={owned ? () => {} : onToggle}
      style={[
        styles.row,
        highlight && { borderColor: accent, borderWidth: 1.5 },
        checked && !owned && { borderColor: accent },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: accent + '22' }]}>
        <Ionicons name={plan.icon} size={20} color={accent} />
      </View>

      <View style={styles.body}>
        <Text style={styles.title}>{plan.title}</Text>
        <Text style={styles.blurb}>{plan.blurb}</Text>
      </View>

      {owned ? (
        <View style={styles.ownedPill}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.gold} />
          <Text style={styles.ownedText}>Owned</Text>
        </View>
      ) : (
        <View style={styles.right}>
          <Text style={styles.price}>{priceLabel}</Text>
          <View
            style={[
              styles.checkbox,
              checked && { backgroundColor: accent, borderColor: accent },
            ]}
          >
            {checked ? (
              <Ionicons name="checkmark" size={15} color="#131313" />
            ) : null}
          </View>
        </View>
      )}
    </AnimatedButton>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  blurb: { fontSize: 11.5, fontWeight: '500', color: Colors.textDim, lineHeight: 15 },
  right: { alignItems: 'flex-end', gap: 6 },
  price: { fontSize: 13, fontWeight: '800', color: Colors.text },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: Colors.borderHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.gold,
    backgroundColor: 'rgba(232,194,117,0.08)',
  },
  ownedText: { color: Colors.gold, fontWeight: '800', fontSize: 11 },
});
