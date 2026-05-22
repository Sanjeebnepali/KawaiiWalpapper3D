import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { toast } from '../lib/toast';
import { shareWallpaper } from '../lib/wallpaperActions';
import { AnimatedButton } from './AnimatedButton';
import { PremiumSheet } from './PremiumSheet';

export type WallpaperInfoModalRef = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  item: { id: string; image: string; title: string; tag: string; accent: string };
};

/**
 * Premium replacement for the Wallpaper Info `Alert`. Shows a compact image
 * preview, the accent-colored tag, and a metadata table; the Share button
 * runs the existing `shareWallpaper` helper.
 */
export const WallpaperInfoModal = forwardRef<WallpaperInfoModalRef, Props>(
  ({ item }, ref) => {
    const theme = useTheme();
    const sheetRef = useRef<BottomSheetModal>(null);

    useImperativeHandle(
      ref,
      () => ({
        present: () => sheetRef.current?.present(),
        dismiss: () => sheetRef.current?.dismiss(),
      }),
      [],
    );

    const onShare = async () => {
      sheetRef.current?.dismiss();
      const r = await shareWallpaper(item.image, item.id);
      toast(r.message);
    };

    const rows: { label: string; value: string }[] = [
      { label: 'Tag', value: item.tag },
      { label: 'Resolution', value: '720 × 1280' },
      { label: 'Format', value: 'JPG' },
      { label: 'Source', value: 'AI generated' },
      { label: 'ID', value: item.id },
    ];

    return (
      <PremiumSheet
        ref={sheetRef}
        snapPoints={['55%']}
        title="Wallpaper Info"
        accentColor={item.accent}
      >
        <View style={styles.header}>
          <Image
            source={{ uri: item.image }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.headerMeta}>
            <Text
              style={[styles.title, { color: theme.text }]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            <View
              style={[
                styles.tagPill,
                { borderColor: item.accent, backgroundColor: 'rgba(0,0,0,0.35)' },
              ]}
            >
              <View
                style={[styles.tagDot, { backgroundColor: item.accent }]}
              />
              <Text style={[styles.tagText, { color: item.accent }]} numberOfLines={1}>
                {item.tag}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.table}>
          {rows.map((r, i) => (
            <Animated.View
              key={r.label}
              entering={FadeInUp.delay(80 + i * 40).springify()}
              style={[styles.row, i === rows.length - 1 && styles.rowLast]}
            >
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text
                style={[styles.rowValue, { color: theme.text }]}
                numberOfLines={1}
              >
                {r.value}
              </Text>
            </Animated.View>
          ))}
        </View>

        <AnimatedButton
          onPress={onShare}
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: theme.primary, shadowColor: theme.primary },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons name="share-social-outline" size={18} color="#131313" />
          <Text style={styles.shareText}>Share</Text>
        </AnimatedButton>
        <AnimatedButton
          onPress={() => sheetRef.current?.dismiss()}
          style={styles.done}
          hitSlop={8}
        >
          <Text style={[styles.doneText, { color: theme.textDim }]}>Done</Text>
        </AnimatedButton>
      </PremiumSheet>
    );
  },
);

WallpaperInfoModal.displayName = 'WallpaperInfoModal';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceHi,
    marginBottom: Spacing.lg,
  },
  thumb: { width: 64, height: 96, borderRadius: Radius.md },
  headerMeta: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  tagPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tagDot: { width: 5, height: 5, borderRadius: 3 },
  tagText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  table: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceHi,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    minWidth: 92,
  },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '600' },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.pill,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  shareText: { color: '#131313', fontSize: 14, fontWeight: '800' },
  done: { alignItems: 'center', paddingVertical: 10 },
  doneText: { fontSize: 13, fontWeight: '700' },
});
