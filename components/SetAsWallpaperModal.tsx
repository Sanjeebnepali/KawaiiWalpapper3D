import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from '../lib/toast';
import { setAsWallpaper, type WallpaperTarget } from '../lib/wallpaperActions';
import { AnimatedButton } from './AnimatedButton';
import { PremiumSheet } from './PremiumSheet';

export type SetAsWallpaperModalRef = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  item: { id: string; image: string; title: string; accent: string };
};

type Choice = {
  id: WallpaperTarget;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};
const CHOICES: Choice[] = [
  { id: 'lock', label: 'Lock Screen', icon: 'lock-closed-outline' },
  { id: 'home', label: 'Home Screen', icon: 'home-outline' },
  { id: 'both', label: 'Both Screens', icon: 'phone-portrait-outline' },
];

/**
 * Premium replacement for the Lock/Home/Both system `Alert`. The parent
 * (wallpaper/[id]) holds a ref; `present()` resets the selection and opens
 * the sheet. The user picks a target (selected card glows `theme.primary`),
 * taps Apply, and the sheet dismisses immediately while the action runs.
 */
export const SetAsWallpaperModal = forwardRef<SetAsWallpaperModalRef, Props>(
  ({ item }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [target, setTarget] = useState<WallpaperTarget | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => {
          setTarget(null);
          sheetRef.current?.present();
        },
        dismiss: () => sheetRef.current?.dismiss(),
      }),
      [],
    );

    const onApply = async () => {
      if (!target) return;
      sheetRef.current?.dismiss();
      const r = await setAsWallpaper(item.image, item.id, target);
      toast(r.message);
    };

    return (
      <PremiumSheet
        ref={sheetRef}
        snapPoints={['62%']}
        title="Set as Wallpaper"
        subtitle="Choose where to apply"
        accentColor={item.accent}
      >
        <View style={styles.preview}>
          <Image
            source={{ uri: item.image }}
            style={styles.previewImg}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.previewMeta}>
            <Text
              style={[styles.previewTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.previewSub}>720 × 1280 · JPG</Text>
          </View>
        </View>

        <View style={styles.choices}>
          {CHOICES.map((c, i) => {
            const selected = target === c.id;
            return (
              <Animated.View
                key={c.id}
                entering={FadeInUp.delay(80 + i * 50).springify()}
              >
                <AnimatedButton
                  onPress={() => setTarget(c.id)}
                  style={[
                    styles.choice,
                    selected && {
                      borderColor: theme.primary,
                      shadowColor: theme.primary,
                      shadowOpacity: 0.45,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 0 },
                      elevation: 6,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.choiceIconWrap,
                      selected && { backgroundColor: theme.primary },
                    ]}
                  >
                    <Ionicons
                      name={c.icon}
                      size={20}
                      color={selected ? '#131313' : theme.text}
                    />
                  </View>
                  <Text
                    style={[
                      styles.choiceLabel,
                      { color: theme.text },
                      selected && { fontWeight: '800' },
                    ]}
                  >
                    {c.label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      selected && { borderColor: theme.primary },
                    ]}
                  >
                    {selected ? (
                      <View
                        style={[styles.radioDot, { backgroundColor: theme.primary }]}
                      />
                    ) : null}
                  </View>
                </AnimatedButton>
              </Animated.View>
            );
          })}
        </View>

        <AnimatedButton
          onPress={onApply}
          disabled={!target}
          style={({ pressed }) => [
            styles.apply,
            {
              backgroundColor: theme.primary,
              shadowColor: theme.primary,
              opacity: !target ? 0.45 : 1,
            },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="checkmark" size={18} color="#131313" />
          <Text style={styles.applyText}>Apply</Text>
        </AnimatedButton>
        <AnimatedButton
          onPress={() => sheetRef.current?.dismiss()}
          style={styles.cancel}
          hitSlop={8}
        >
          <Text style={[styles.cancelText, { color: theme.textDim }]}>Cancel</Text>
        </AnimatedButton>
      </PremiumSheet>
    );
  },
);

SetAsWallpaperModal.displayName = 'SetAsWallpaperModal';

const styles = StyleSheet.create({
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceHi,
    marginBottom: Spacing.md,
  },
  previewImg: {
    width: 56,
    height: 80,
    borderRadius: Radius.md,
  },
  previewMeta: { flex: 1, gap: 2 },
  previewTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  previewSub: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
  choices: { gap: Spacing.sm, marginBottom: Spacing.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceHi,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  choiceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  apply: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  applyText: { color: '#131313', fontSize: 14, fontWeight: '800' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { fontSize: 13, fontWeight: '700' },
});
