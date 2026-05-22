import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, type ReactNode, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type Props = {
  /** Bottom-sheet snap points (e.g. ['50%', '78%']). Default `['62%']`. */
  snapPoints?: (string | number)[];
  /** Title rendered above the content (themed). */
  title?: string;
  subtitle?: string;
  /**
   * Optional accent color for the gradient strip across the top of the
   * sheet. Defaults to `theme.primary`. Set `showAccent={false}` to hide.
   */
  accentColor?: string;
  showAccent?: boolean;
  children: ReactNode;
};

/**
 * Shared premium-look wrapper around `BottomSheetModal` (@gorhom). Adds a
 * themed background, dim backdrop, gradient accent strip across the top,
 * and consistent title/subtitle spacing — so individual sheets
 * (WallpaperMenu, ThemeModal, SetAsWallpaperModal, WallpaperInfoModal)
 * stay focused on their content.
 */
export const PremiumSheet = forwardRef<BottomSheetModal, Props>(
  (
    {
      snapPoints = ['62%'],
      title,
      subtitle,
      accentColor,
      showAccent = true,
      children,
    },
    ref,
  ) => {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const accent = accentColor ?? theme.primary;

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.62}
        />
      ),
      [],
    );

    const memoSnap = useMemo(() => snapPoints, [snapPoints]);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={memoSnap}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        {showAccent ? (
          <LinearGradient
            colors={[accent, theme.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.accentStrip}
          />
        ) : null}
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            // Clear the Android gesture-nav / iOS home indicator so the last
            // row (Cancel / Apply / Done) never sits under the system bar.
            { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 0) },
          ]}
        >
          {title ? (
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

PremiumSheet.displayName = 'PremiumSheet';

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: { backgroundColor: Colors.textDim, width: 40 },
  accentStrip: {
    height: 3,
    marginHorizontal: Spacing.lg,
    marginTop: 4,
    borderRadius: 2,
    opacity: 0.85,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: Spacing.md,
  },
  body: { gap: Spacing.sm },
});
