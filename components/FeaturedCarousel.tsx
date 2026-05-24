import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { featured, type FeaturedItem } from '../constants/mockData';
import { Spacing } from '../constants/theme';
import { GlassCard } from './GlassCard';

const GAP = Spacing.md;

const Separator = () => <View style={styles.sep} />;
const keyExtractor = (item: FeaturedItem) => item.id;

function FeaturedCarouselBase() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = Math.round(width * 0.72);
  const cardH = Math.round(cardW * (16 / 9));

  const onOpen = useCallback(
    (id: string) => router.push(`/wallpaper/${id}`),
    [router],
  );

  const renderItem: ListRenderItem<FeaturedItem> = useCallback(
    ({ item }) => (
      <GlassCard
        image={item.image}
        title={item.title}
        tag={item.tag}
        accent={item.accent}
        width={cardW}
        height={cardH}
        premium={item.premium}
        onPress={() => onOpen(item.id)}
      />
    ),
    [cardW, cardH, onOpen],
  );

  // Equal-width carousel: every item is exactly cardW + GAP wide. Telling
  // FlatList that up-front skips a measurement pass and lets snap-to-interval
  // jump without any layout work.
  const getItemLayout = useMemo(
    () => (_: ArrayLike<FeaturedItem> | null | undefined, index: number) => ({
      length: cardW,
      offset: (cardW + GAP) * index,
      index,
    }),
    [cardW],
  );

  return (
    <FlatList
      data={featured}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardW + GAP}
      decelerationRate="fast"
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews
    />
  );
}

export const FeaturedCarousel = memo(FeaturedCarouselBase);

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  sep: { width: GAP },
});
