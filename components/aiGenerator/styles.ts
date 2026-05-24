import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  // Wider gap (Spacing.lg → Spacing.xl) so the four sections
  // (head / prompt / quick starts / recent) read as distinct cards
  // rather than one stacked block. paddingBottom is overridden inline
  // with the safe-area inset, but the StyleSheet entry still sets a
  // sane fallback for the rare case where useSafeAreaInsets() hasn't
  // resolved yet.
  scroll: { padding: Spacing.lg, gap: Spacing.xl, paddingBottom: 200 },
  head: { gap: 4, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  eyebrow: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: Colors.textDim, fontSize: 12, fontWeight: '700' },

  promptBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  input: {
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  aspectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aspectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aspectText: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  promptFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diceText: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
  generate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  generateText: { color: '#131313', fontWeight: '800', fontSize: 13 },

  tokenHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(252,211,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.35)',
  },
  tokenHintText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },

  section: { color: Colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    maxWidth: '100%',
  },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: '600' },

  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentHint: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  recentRow: { gap: Spacing.sm, paddingRight: Spacing.lg, paddingTop: Spacing.sm },
  recentCell: {
    width: 90,
    height: 140,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  // Empty bottom block that guarantees the ScrollView always has more
  // height than the viewport, so it's always genuinely scrollable
  // (not just bouncy). Combined with `alwaysBounceVertical` + Android
  // `overScrollMode="always"` this makes the screen feel "flowy"
  // even when the four real sections fit on a tall device.
  tailSpacer: { height: 120 },
});
