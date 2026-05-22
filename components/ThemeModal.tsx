import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '../constants/theme';
import { ThemePicker } from './ThemePicker';

type Props = {
  /** Forwarded to ThemePicker — the parent passes a dismiss callback. */
  onSelect?: () => void;
};

/**
 * Bottom-sheet wrapper around <ThemePicker> (Issue 4). The Settings screen
 * holds the ref and calls `.present()`; picking a theme fires `onSelect`,
 * which dismisses the sheet.
 */
export const ThemeModal = forwardRef<BottomSheetModal, Props>(
  ({ onSelect }, ref) => {
    const insets = useSafeAreaInsets();
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.6}
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['62%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.content,
            // Clear the system gesture-nav / home indicator.
            { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 0) },
          ]}
        >
          <Text style={styles.title}>Select Theme</Text>
          <Text style={styles.subtitle}>
            Tap a theme to apply it across the whole app.
          </Text>
          <ThemePicker onSelect={onSelect} />
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

ThemeModal.displayName = 'ThemeModal';

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: { backgroundColor: Colors.textDim, width: 40 },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  subtitle: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
});
