import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

const SIDE = Spacing.lg;
const GAP = Spacing.sm + 2;

export const stylesPart2 = StyleSheet.create({
  // applied row (inside the original Mood Mode card — kept for fallback)
  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
  },
  appliedThumb: {
    width: 48,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHi,
  },

  // Promoted-to-top "Currently applied" card. Larger than the inline thumb so
  // the user can actually see the wallpaper from across the room.
  appliedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm + 2,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  appliedCardThumb: {
    width: 64,
    height: 80,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
  },
  appliedLabel: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  appliedTitle: { fontSize: 13, fontWeight: '800', marginTop: 2 },

  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privacyText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },

  // sub-rows for background / notification card
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 6,
  },
  subRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subRowTitle: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  subRowBody: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  testBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },

  statusLine: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.2,
  },

  // target-app chips for Tier 2 (deprecated; kept for shape compat)
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: Colors.bgAlt,
  },
  chipText: { fontSize: 11, fontWeight: '800' },

  // sections
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SIDE,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionHint: { color: Colors.textDim, fontSize: 11, fontWeight: '700' },

  // emoji row
  emojiRow: {
    flexDirection: 'row',
    paddingHorizontal: SIDE,
    gap: GAP,
  },

  // browse
  browseRow: {
    paddingHorizontal: SIDE,
    gap: 10,
  },
  browseCard: {
    width: 130,
    height: 160,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'flex-end',
  },
  browseShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  browseBody: { gap: 2 },
  browseEmoji: { fontSize: 30 },
  browseLabel: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  browseTag: {
    color: '#131313',
    opacity: 0.7,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
