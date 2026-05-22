import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '../constants/theme';
import { AnimatedButton } from './AnimatedButton';

type Props = {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
};

/**
 * Reusable premium bottom-sheet picker (@gorhom/bottom-sheet).
 * Parent holds the ref and calls `.present()` / `.dismiss()`.
 * Options stagger in with reanimated FadeInDown spring.
 */
export const PremiumModal = forwardRef<BottomSheetModal, Props>(
  ({ title, options, selected, onSelect }, ref) => {
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
        snapPoints={['55%']}
        enableDynamicSizing={false}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handle}
      >
        <BottomSheetView
          style={[
            styles.content,
            // Clear the system gesture-nav / home indicator.
            { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 0) },
          ]}
        >
          <Text style={styles.title}>{title}</Text>
          {options.map((opt, i) => {
            const isSelected = opt === selected;
            return (
              <Animated.View
                key={opt}
                entering={FadeInDown.delay(i * 45).springify()}
              >
                <AnimatedButton
                  onPress={() => onSelect(opt)}
                  style={[
                    styles.option,
                    isSelected ? styles.optionSelected : styles.optionIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && styles.optionTextSelected,
                    ]}
                  >
                    {opt}
                  </Text>
                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={20} color={Colors.pink} />
                  )}
                </AnimatedButton>
              </Animated.View>
            );
          })}
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

PremiumModal.displayName = 'PremiumModal';

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: Colors.textDim,
    width: 40,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    backgroundColor: Colors.surfaceHi,
  },
  optionIdle: { borderColor: Colors.border },
  optionSelected: { borderColor: Colors.pink },
  optionText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  optionTextSelected: { color: Colors.pink },
});
