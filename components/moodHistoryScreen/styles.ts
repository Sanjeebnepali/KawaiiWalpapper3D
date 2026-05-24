import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },

  // tally
  tallyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  tallyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tallyEmoji: { fontSize: 13 },
  tallyCount: { fontSize: 11, fontWeight: '800', minWidth: 12, textAlign: 'right' },

  // row
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 140 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  rowEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 22 },
  rowBody: { flex: 1, gap: 4 },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  srcPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  srcPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  rowMeta: { color: Colors.textDim, fontSize: 11, fontWeight: '700' },

  // empty
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  helperText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
  backToCta: {
    marginTop: Spacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  backToCtaText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
