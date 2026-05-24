import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

const SIDE = Spacing.lg;
const GAP = Spacing.sm + 2;

// Styles for the bottom "Choose album" horizontal strip (changes/054).
export const pickerStripStyles = StyleSheet.create({
  row: {
    paddingHorizontal: SIDE,
    paddingBottom: Spacing.md,
    gap: GAP,
  },
  card: {
    width: 120,
    height: 160,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  shade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFoot: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Spacing.sm,
    gap: 2,
  },
  cardName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
  },
  customCard: {
    borderStyle: 'dashed',
    backgroundColor: 'rgba(220, 184, 255, 0.08)',
  },
  customInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: Spacing.sm,
  },
  customLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  customMeta: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '700',
  },
});
