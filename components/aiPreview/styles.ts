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
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },

  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    // paddingBottom is set inline above as `insets.bottom + Spacing.xl`
    // so the bottom tertiary row clears the OS gesture pill / nav.
  },
  imageWrap: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  promptBlock: {
    // Scroll's `gap: Spacing.lg` already separates sections — no
    // marginTop needed here.
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptLabel: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  promptText: { fontSize: 14, fontWeight: '600', marginTop: 4, lineHeight: 19 },

  // ─── Action hierarchy ────────────────────────────────────────────────
  // Primary: the main reason the user came here (set as wallpaper)
  // Secondary: also-useful actions (save, add to pool)
  // Tertiary: navigational / destructive (retry, discard)
  primaryBtn: {
    height: 54,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: '#131313',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  tertiaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  tertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tertiaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: { color: Colors.textDim, fontSize: 13, textAlign: 'center' },
});
