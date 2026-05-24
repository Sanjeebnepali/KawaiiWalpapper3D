import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

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
