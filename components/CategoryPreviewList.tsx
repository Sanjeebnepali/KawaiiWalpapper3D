import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  categoryIcons,
  getCategoryPhotos,
  type CategoryId,
  type CategoryPhoto,
} from '../constants/mockData';
import { Colors, Radius, Spacing } from '../constants/theme';
import { SimpleButton } from './SimpleButton';

const SIDE = Spacing.lg;
const GAP = 8;

type Section = {
  id: CategoryId;
  label: string;
  accent: string;
  photos: CategoryPhoto[];
};

// Built once at module load — the data is fully synchronous (URLs generated
// from seeds) so there's no benefit to re-computing per mount.
// Curated preview rows on Home: Painting first (owner's pick), Gym/Yoga
// excluded (already in the scrollable category row above). 3 tall cards per
// row to match the reference look.
const PREVIEW_KEYS = ['painting', 'football', 'studying', 'dance', 'cooking', 'photography'];
const SECTIONS: Section[] = PREVIEW_KEYS.map((key) => {
  const ic = categoryIcons.find((c) => c.id === key);
  return {
    id: key,
    label: ic?.label ?? key,
    accent: ic?.tint ?? Colors.pink,
    photos: getCategoryPhotos(key, 3),
  };
}).filter((s) => s.photos.length > 0);

function CategoryPreviewListBase() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  // 3 columns of tall portrait cards (reference look), was 4 squares.
  const cellW = useMemo(
    () => Math.floor((width - SIDE * 2 - GAP * 2) / 3),
    [width],
  );

  const onOpenCategory = useCallback(
    (id: CategoryId) => router.push(`/category/${id}`),
    [router],
  );
  const onOpenPhoto = useCallback(
    (pid: string) => router.push(`/wallpaper/${pid}`),
    [router],
  );

  return (
    <View style={styles.wrap}>
      {SECTIONS.map((s) => (
        <CategorySection
          key={s.id}
          section={s}
          cellW={cellW}
          onOpenCategory={onOpenCategory}
          onOpenPhoto={onOpenPhoto}
        />
      ))}
    </View>
  );
}

export const CategoryPreviewList = memo(CategoryPreviewListBase);

// Each section is its own memo so a parent re-render (e.g. theme switch)
// doesn't blow away the 4 expo-image instances per row. Static `section`
// + stable callbacks mean memo holds across home re-renders.
const CategorySection = memo(function CategorySection({
  section,
  cellW,
  onOpenCategory,
  onOpenPhoto,
}: {
  section: Section;
  cellW: number;
  onOpenCategory: (id: CategoryId) => void;
  onOpenPhoto: (id: string) => void;
}) {
  const goCategory = useCallback(
    () => onOpenCategory(section.id),
    [onOpenCategory, section.id],
  );

  return (
    <View style={styles.section}>
      <SimpleButton onPress={goCategory} style={styles.titleRow} hitSlop={4}>
        <View
          style={[
            styles.dot,
            { backgroundColor: section.accent, shadowColor: section.accent },
          ]}
        />
        <Text style={styles.title}>{section.label}</Text>
      </SimpleButton>

      <View style={styles.row}>
        {section.photos.map((p) => (
          <PhotoCell
            key={p.id}
            photo={p}
            size={cellW}
            onOpen={onOpenPhoto}
          />
        ))}
      </View>

      <SimpleButton onPress={goCategory} style={styles.viewAllRow} hitSlop={6}>
        <Text style={styles.viewAll}>View All</Text>
        <Ionicons name="chevron-forward" size={12} color={Colors.textDim} />
      </SimpleButton>
    </View>
  );
});

const PhotoCell = memo(function PhotoCell({
  photo,
  size,
  onOpen,
}: {
  photo: CategoryPhoto;
  size: number;
  onOpen: (id: string) => void;
}) {
  const onPressIn = useCallback(() => Image.prefetch(photo.image), [photo.image]);
  const onPress = useCallback(() => onOpen(photo.id), [onOpen, photo.id]);
  // SimpleButton (native Pressable opacity) instead of AnimatedButton —
  // 16 of these mount on Home alone; the worklet cost of 16 sharedValues
  // wasn't worth the spring-scale press feedback in a thumbnail.
  return (
    <SimpleButton
      onPressIn={onPressIn}
      onPress={onPress}
      style={[styles.cell, { width: size, height: Math.round(size * 1.5) }]}
    >
      <Image
        source={{ uri: photo.image }}
        style={styles.img}
        contentFit="cover"
        transition={0}
        cachePolicy="memory-disk"
        recyclingKey={photo.id}
      />
    </SimpleButton>
  );
});

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: SIDE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.lg,
  },
  section: { gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  title: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  row: { flexDirection: 'row', gap: GAP },
  cell: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  img: { width: '100%', height: '100%' },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    paddingTop: 2,
  },
  viewAll: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
});
