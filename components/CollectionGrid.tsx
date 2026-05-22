import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useCallback } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { collections, type Collection } from '../constants/mockData';
import { Colors, Radius, Spacing } from '../constants/theme';
import { SimpleButton } from './SimpleButton';

const COLS = 2;
const GAP = Spacing.md;
const SIDE = Spacing.lg;
/** Portrait-ish card aspect (width / height). 0.8 = card is 25 % taller
 *  than wide — premium phone-screen look. */
const CARD_ASPECT = 0.8;

const keyExtractor = (item: Collection) => item.id;

// Vertical spacing between rows. ItemSeparatorComponent is the
// cross-platform-deterministic row-spacing for numColumns > 1
// (contentContainerStyle.gap was unreliable on Android — some RN
// versions silently skip it).
const RowSeparator = () => <View style={styles.rowSep} />;

// Flex-based item layout. `flex: 1` makes each card claim half of the
// row width MINUS the column gap, computed by RN's layout engine — no
// pixel math, no floor() slack, no right-edge gap on any device width.
// Replaces the prior explicit `width: itemW, height: itemH` that could
// leave 1–2 px on the right after rounding (user-reported as
// "one side fits, other side has empty space"). aspectRatio keeps the
// card's height proportional to its computed width.
const columnWrapper = { gap: GAP };

function CollectionGridBase() {
  const router = useRouter();

  // Collections are mood/emotion sets — open the generalized browse grid
  // (/category/mood-<key>).
  const onOpen = useCallback(
    (id: string) => router.push(`/category/${id}`),
    [router],
  );

  const renderItem: ListRenderItem<Collection> = useCallback(
    ({ item }) => <CollectionCard item={item} onOpen={onOpen} />,
    [onOpen],
  );

  // Embedded inside the parent FlatList — scrollEnabled=false hands scrolling
  // to the parent. Only 6 items total, so we skip getItemLayout (which is
  // tricky with numColumns) and let FlatList measure.
  return (
    <FlatList
      data={collections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      numColumns={COLS}
      columnWrapperStyle={columnWrapper}
      contentContainerStyle={styles.grid}
      ItemSeparatorComponent={RowSeparator}
      scrollEnabled={false}
      initialNumToRender={4}
      maxToRenderPerBatch={2}
      windowSize={3}
    />
  );
}

export const CollectionGrid = memo(CollectionGridBase);

const CollectionCard = memo(function CollectionCard({
  item: c,
  onOpen,
}: {
  item: Collection;
  onOpen: (id: string) => void;
}) {
  const onPress = useCallback(() => onOpen(c.id), [onOpen, c.id]);
  return (
    <SimpleButton onPress={onPress} style={styles.item}>

      <View style={styles.bg}>
        <Image
          source={{ uri: c.image }}
          style={[StyleSheet.absoluteFill, styles.bgInner]}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          recyclingKey={c.id}
        />
        {/* Flat darken — replaces LinearGradient (changes/032). */}
        <View style={styles.darken} pointerEvents="none" />
        <View style={styles.topRow}>
          {c.badge ? (
            <View style={[styles.badge, { backgroundColor: c.accent }]}>
              <Text style={styles.badgeText}>{c.badge}</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={[styles.count, { borderColor: c.accent }]}>
            <Text style={[styles.countText, { color: c.accent }]}>{c.count}</Text>
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{c.title}</Text>
          <View style={styles.subRow}>
            <Text style={styles.sub} numberOfLines={1}>{c.subtitle}</Text>
            <View style={[styles.chev, { backgroundColor: c.accent }]}>
              <Ionicons name="arrow-forward" size={12} color="#131313" />
            </View>
          </View>
        </View>
      </View>
    </SimpleButton>
  );
});

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: SIDE,
    paddingBottom: Spacing.xl,
  },
  rowSep: { height: GAP },
  item: {
    flex: 1,
    aspectRatio: CARD_ASPECT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  bg: { flex: 1, justifyContent: 'space-between', padding: Spacing.sm },
  bgInner: { borderRadius: Radius.lg },
  darken: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  badgeText: {
    color: '#131313',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  count: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  countText: { fontSize: 11, fontWeight: '700' },
  body: { gap: 2 },
  title: { color: Colors.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  subRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sub: { color: Colors.textDim, fontSize: 11, fontWeight: '600', flex: 1, marginRight: 8 },
  chev: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
