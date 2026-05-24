import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import { FlatList, type ListRenderItem, StyleSheet, View } from 'react-native';
import { bestPicks, type CategoryPhoto } from '../constants/mockData';
import { Colors, Spacing } from '../constants/theme';
import { SimpleButton } from './SimpleButton';

// 3-column grid of big, tall portrait cards — the premium, image-forward home
// hero (modelled on the Zedge "Popular" reference the owner shared).
const COLS = 3;
const GAP = 8;
const SIDE = Spacing.lg;
const CARD_RADIUS = 18;
// width / height — tall phone-screen shape (matches the reference ~1:1.9).
const CARD_ASPECT = 0.52;

const keyExtractor = (p: CategoryPhoto) => p.id;
const columnWrapper = { gap: GAP };
const RowSeparator = () => <View style={styles.rowSep} />;

function BestPicksGridBase() {
  const router = useRouter();
  const onOpen = useCallback(
    (id: string) => router.push(`/wallpaper/${id}`),
    [router],
  );

  const renderItem: ListRenderItem<CategoryPhoto> = useCallback(
    ({ item }) => <Cell photo={item} onOpen={onOpen} />,
    [onOpen],
  );

  // Embedded in the home FlatList — scrollEnabled=false hands scrolling to the
  // parent. FREE curated picks only (NOT the subscription premium collection —
  // that lives behind the Premium Collection tab so it's never applied for free).
  return (
    <FlatList
      data={bestPicks}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={COLS}
      columnWrapperStyle={columnWrapper}
      contentContainerStyle={styles.grid}
      ItemSeparatorComponent={RowSeparator}
      scrollEnabled={false}
      initialNumToRender={9}
      maxToRenderPerBatch={6}
      windowSize={5}
    />
  );
}

export const BestPicksGrid = memo(BestPicksGridBase);

const Cell = memo(function Cell({
  photo,
  onOpen,
}: {
  photo: CategoryPhoto;
  onOpen: (id: string) => void;
}) {
  const onPress = useCallback(() => onOpen(photo.id), [onOpen, photo.id]);
  return (
    <SimpleButton onPress={onPress} style={styles.cell}>
      <Image
        source={{ uri: photo.image }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={140}
        cachePolicy="memory-disk"
        recyclingKey={photo.id}
      />
    </SimpleButton>
  );
});

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: SIDE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  rowSep: { height: GAP },
  cell: {
    flex: 1,
    aspectRatio: CARD_ASPECT,
    borderRadius: CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
});
