import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';
import { AnimatedButton } from './AnimatedButton';
import { SmoothToggle } from './SmoothToggle';

/** Uppercase grey section header + a #1E1E1E rounded card wrapping the rows. */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionHeader}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * One row inside a section. `right` is whatever control sits on the right
 * (Toggle, RowValue, Slider, nothing). `divider` draws the #333 line below;
 * pass `divider={false}` on the last row of a section.
 */
export function SettingsRow({
  icon,
  iconColor,
  label,
  subtitle,
  right,
  onPress,
  danger,
  divider = true,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
  divider?: boolean;
}) {
  const body = (
    <View style={[styles.row, !divider && styles.rowNoDivider]}>
      {icon && (
        <Ionicons
          name={icon}
          size={18}
          color={danger ? Colors.error : iconColor ?? Colors.textDim}
          style={styles.rowIcon}
        />
      )}
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>
          {label}
        </Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right && <View style={styles.rowRight}>{right}</View>}
    </View>
  );

  if (onPress) {
    return <AnimatedButton onPress={onPress}>{body}</AnimatedButton>;
  }
  return body;
}

/** Spring-animated toggle (see SmoothToggle) with the spec's pink-on colors. */
export function Toggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return <SmoothToggle value={value} onValueChange={onValueChange} />;
}

/** Right-side "value + chevron" used by chevron rows and dropdown rows. */
export function RowValue({
  text,
  chevron = 'forward',
}: {
  text?: string;
  chevron?: 'forward' | 'down' | 'external';
}) {
  const iconName =
    chevron === 'down'
      ? 'chevron-down'
      : chevron === 'external'
        ? 'open-outline'
        : 'chevron-forward';
  return (
    <View style={styles.rowValue}>
      {text && <Text style={styles.rowValueText}>{text}</Text>}
      <Ionicons name={iconName} size={16} color={Colors.textMute} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  sectionHeader: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowNoDivider: { borderBottomWidth: 0 },
  rowIcon: { width: 20, textAlign: 'center' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  rowLabelDanger: { color: Colors.error },
  rowSubtitle: { color: Colors.textDim, fontSize: 11, fontWeight: '500' },
  rowRight: { marginLeft: 'auto' },
  rowValue: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowValueText: { color: Colors.textDim, fontSize: 13, fontWeight: '600' },
});
