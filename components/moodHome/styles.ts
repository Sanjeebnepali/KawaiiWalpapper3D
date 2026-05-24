import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

const SIDE = Spacing.lg;
const GAP = Spacing.sm + 2;

export const styles = StyleSheet.create({
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

// Custom-minutes bottom-sheet styles. Kept separate from `styles` so the
// imperative grouping (input row → presets → note → save) stays together
// instead of being interleaved into the main map by sort order.
export const customSheetStyles = StyleSheet.create({
  body: { gap: Spacing.lg },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  input: {
    minWidth: 100,
    textAlign: 'center',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
  },
  unit: {
    color: Colors.textDim,
    fontSize: 18,
    fontWeight: '800',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  note: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#131313',
    letterSpacing: -0.2,
  },
});

// Sleep/Wake-specific styles. The card itself reuses `styles.modeCard` /
// `styles.poolRow` / `styles.modeHead` from the main map — only the new
// dual-thumb (showing both pack images side-by-side) + the two time cells
// + the picker rows need their own definitions.
export const swStyles = StyleSheet.create({
  // Dual thumbnail showing both wake (top half) and sleep (bottom half) of
  // a Sleep/Wake pack — used in the active-pack row + picker rows.
  dualThumb: {
    width: 48,
    height: 60,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  dualThumbHalf: {
    width: '100%',
    height: '50%',
  },
  // Two wake/sleep time pickers side by side.
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  timeCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgAlt,
  },
  timeLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // Pack picker rows.
  packRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
  },
  packPair: {
    width: 56,
    height: 70,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  packPairHalf: {
    width: '100%',
    height: '50%',
  },
  packName: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  packTag: { fontSize: 11, fontWeight: '700' },

  // ─── Custom-pair picker ─────────────────────────────────────────────
  slotRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  slotLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  slotImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
  },
  slotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  photoCell: {
    // Width + height set inline from useWindowDimensions so percentage
    // layout doesn't fight aspectRatio inside the bottom-sheet's
    // BottomSheetScrollView (which sometimes reports unstable widths).
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  photoSelectedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSelectedBadgeText: {
    fontSize: 13,
  },
  saveBtn: {
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    color: '#131313',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  galleryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
  },
  galleryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  divider: {
    color: Colors.textMute,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

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
