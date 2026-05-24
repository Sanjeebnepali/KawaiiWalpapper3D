import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

const SIDE = Spacing.lg;

export const stylesPart1 = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { paddingBottom: 140 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  h1: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: Colors.bg,
  },

  // mode card
  modeWrap: { paddingHorizontal: SIDE },
  modeCard: {
    borderRadius: Radius.xxl,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  modeHeadLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  modeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  modeTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  modeBody: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  toggleBtn: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 2,
    justifyContent: 'center',
  },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  toggleKnobOn: {
    alignSelf: 'flex-end',
  },

  // pool row
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
  },
  poolThumb: {
    width: 48,
    height: 60,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  poolLabel: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  poolName: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  poolMeta: { color: Colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },

  // balance
  balanceRow: { flexDirection: 'row', gap: 4 },
  balanceCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgAlt,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: 2,
  },
  balanceEmoji: { fontSize: 14 },
  balanceCount: { fontSize: 10, fontWeight: '800' },

  // live row
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.md,
    borderWidth: 1,
    backgroundColor: Colors.bgAlt,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveText: { color: Colors.text, fontSize: 12, fontWeight: '800', flex: 1 },
});
