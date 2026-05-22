import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { themes, type ThemeItem } from '../constants/mockData';
import { Colors, Radius, Spacing } from '../constants/theme';
import { SimpleButton } from './SimpleButton';

const GAP = Spacing.md;

const Separator = () => <View style={styles.sep} />;
const keyExtractor = (item: ThemeItem) => item.id;

function ThemeBasedRowBase() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardW = Math.round(width * 0.42);
  const cardH = Math.round(cardW * 1.15);

  // Theme cards are 2D Kawaii sets — open the generalized browse grid
  // (/category/2d-<key>) rather than the shuffle theme-pack screen.
  const onOpen = useCallback(
    (id: string) => router.push(`/category/${id}`),
    [router],
  );

  const renderItem: ListRenderItem<ThemeItem> = useCallback(
    ({ item }) => (
      <ThemeCard
        item={item}
        width={cardW}
        height={cardH}
        onOpen={onOpen}
      />
    ),
    [cardW, cardH, onOpen],
  );

  const getItemLayout = useMemo(
    () => (_: ArrayLike<ThemeItem> | null | undefined, index: number) => ({
      length: cardW,
      offset: (cardW + GAP) * index,
      index,
    }),
    [cardW],
  );

  return (
    <FlatList
      data={themes}
      keyExtractor={keyExtractor}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={cardW + GAP}
      decelerationRate="fast"
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={Separator}
      renderItem={renderItem}
      getItemLayout={getItemLayout}
      initialNumToRender={3}
      maxToRenderPerBatch={2}
      windowSize={3}
      removeClippedSubviews
    />
  );
}

export const ThemeBasedRow = memo(ThemeBasedRowBase);

const ThemeCard = memo(function ThemeCard({
  item,
  width,
  height,
  onOpen,
}: {
  item: ThemeItem;
  width: number;
  height: number;
  onOpen: (id: string) => void;
}) {
  const onPress = useCallback(() => onOpen(item.id), [onOpen, item.id]);
  return (
    <SimpleButton
      onPress={onPress}
      style={[styles.card, { width, height }]}
    >
      <View style={styles.bg}>
        <Image
          source={{ uri: item.image }}
          style={[StyleSheet.absoluteFill, styles.bgInner]}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
        {/* Flat darken overlay — replaces the LinearGradient for paint
            cheapness on Android (changes/032). */}
        <View style={styles.darken} pointerEvents="none" />
        <View style={styles.topRow}>
          <View style={[styles.pill, { borderColor: item.accent }]}>
            <View style={[styles.pillDot, { backgroundColor: item.accent }]} />
            <Text style={[styles.pillText, { color: item.accent }]} numberOfLines={1}>
              {item.vibe}
            </Text>
          </View>
          {item.badge ? (
            <View style={[styles.badge, { backgroundColor: item.accent }]}>
              <Text style={styles.badgeText}>{item.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
    </SimpleButton>
  );
});

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  sep: { width: GAP },
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  bg: {
    flex: 1,
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  bgInner: { borderRadius: Radius.xl },
  darken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  pillDot: { width: 5, height: 5, borderRadius: 3 },
  pillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  badgeText: {
    color: '#131313',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
});
