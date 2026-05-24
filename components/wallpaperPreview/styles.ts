import { StyleSheet } from 'react-native';
import { Colors, Radius, Spacing } from '../../constants/theme';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  unavailableRoot: { backgroundColor: Colors.bg },
  unavailable: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  unavailableGlyph: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  unavailableTitle: {
    color: Colors.text, fontSize: 20, fontWeight: '800',
    letterSpacing: -0.3, textAlign: 'center',
  },
  unavailableSub: {
    color: Colors.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center',
  },
  unavailableBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: Radius.pill, marginTop: Spacing.sm,
  },
  unavailableBtnText: { color: '#131313', fontSize: 14, fontWeight: '800' },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loaderText: { color: Colors.text, fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  chrome: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Spacing.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderColor: Colors.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: Radius.pill, borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  footer: { paddingBottom: Spacing.md },
  glass: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.glassStroke,
    backgroundColor: Colors.glassFill,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  meta: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  heart: {
    width: 40, height: 40, borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  apply: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: Radius.pill,
    shadowOpacity: 0.7, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  applyText: { color: '#131313', fontSize: 13, fontWeight: '800' },
});
