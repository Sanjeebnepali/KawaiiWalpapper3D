import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

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
