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
  findCategoryPhoto,
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
const PREVIEW_KEYS = ['painting', 'playing-game', 'football', 'studying', 'dance', 'cooking', 'gardening'];
// Owner's hand-picked images per preview slot (filename). null = keep the
// category's leading catalog image at that slot. Playing-game is added right
// after Painting; Gardening replaces Photography.
const PREVIEW_PICKS: Record<string, [string | null, string | null, string | null]> = {
  painting: [null, 'a3a932eb-d7bd-40e2-8692-6dd6d9222204.png', '734f7490-8b2f-4b8e-96f4-2f341efac069.png'],
  'playing-game': [
    '05d13085-7a4d-4569-b6e3-c07d0a09af66.png',
    '7d3379b3-f0a2-410a-ae03-722eeff4a50d.png',
    '536a274e-bbee-4445-a98c-4362ac7d1c3c.png',
  ],
  football: [null, null, 'ddae626d-83f0-4de4-9aac-e70d5c141ac1.png'],
  studying: [null, null, 'fd3a40c4-8ffc-43c4-918a-16aa9248dcb8.png'],
  dance: [null, null, 'cd3c4e31-32f4-4ebd-bea8-f5494c91b246.png'],
  cooking: ['86ada00c-8d59-4bc2-ad4f-c5ac1e8dabbe.png', '93496523-7db6-4527-a59f-2325e2bcbaa4.png', null],
  gardening: [
    'bcc748f2-1588-4559-b756-3385fdbb431e.png',
    'ac6aefc2-33a8-481e-a9c1-0d7e6c79b506.png',
    '3813c364-fba4-42c3-921b-2c4a99978e0b.png',
  ],
};
const SECTIONS: Section[] = PREVIEW_KEYS.map((key) => {
  const ic = categoryIcons.find((c) => c.id === key);
  const base = getCategoryPhotos(key, 3); // leading catalog photos for kept slots
  const picks = PREVIEW_PICKS[key] ?? [null, null, null];
  const photos: CategoryPhoto[] = [];
  for (let i = 0; i < 3; i++) {
    const file = picks[i];
    const photo = (file ? findCategoryPhoto(key, file) : undefined) ?? base[i];
    if (photo) photos.push(photo);
  }
  return {
    id: key,
    label: ic?.label ?? key,
    accent: ic?.tint ?? Colors.pink,
    photos,
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
