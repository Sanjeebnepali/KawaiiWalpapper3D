import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLLECTION_SIZE } from '../../../constants/shuffle';
import { Colors } from '../../../constants/theme';
import { useMoodPool } from '../../../hooks/useMoodPool';
import { styles } from '../../../components/moodPool/styles';
import {
  PoolCta,
  PoolFooter,
  PoolHeader,
  PoolNotFound,
} from '../../../components/moodPool/PoolViews';

const COLS = 2;
const GAP = 8;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;

/**
 * Mood pool detail — view + lightweight edit.
 *
 * Patterned on `app/theme-pack/[id].tsx`: clean header, top CTA, 2-col
 * photo grid. Adapted for mood pools where photoIds can be either
 * catalog refs (resolved via `getPhotoById`) OR direct `file://` /
 * `content://` URIs from the gallery picker. Renders both uniformly.
 *
 * Two entry points:
 *   1. Pool picker (`app/mood/pick-collection.tsx`) row tap — open an
 *      existing pool to browse its photos. Replaces the old behaviour
 *      where tapping a row silently swapped the active mood pool and
 *      popped back; user reported "I click it select but how can I
 *      see the images in the gallery."
 *   2. Pool picker → "Create your own pool" — creates an empty
 *      collection and routes here so the user lands in the same view
 *      they'll use to manage it long-term, rather than the much
 *      heavier `app/shuffle/[id]` editor (which is wired for the
 *      shuffle hub, not the mood feature).
 */
export default function MoodPoolDetailScreen() {
  const {
    router,
    theme,
    insets,
    collection,
    isUserPool,
    isActiveMood,
    listReady,
    onUseAsMood,
    onAddPress,
    onDeletePool,
    renderItem,
  } = useMoodPool();

  if (!collection) {
    return <PoolNotFound onBack={() => router.back()} />;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <PoolHeader
        name={collection.name}
        isUserPool={isUserPool}
        onBack={() => router.back()}
        onDelete={onDeletePool}
      />

      {/* CTA — use as mood pool / active indicator. */}
      <PoolCta isActiveMood={isActiveMood} onUseAsMood={onUseAsMood} />

      {/* Photo grid OR empty state. */}
      {listReady ? (
        collection.photoIds.length > 0 ? (
          <FlatList
            data={collection.photoIds}
            keyExtractor={(p) => p}
            numColumns={COLS}
            columnWrapperStyle={columnWrapper}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={Separator}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={4}
            maxToRenderPerBatch={2}
            updateCellsBatchingPeriod={30}
            windowSize={3}
            renderItem={renderItem}
            ListHeaderComponent={
              isUserPool ? (
                <Text style={styles.meta}>
                  {collection.photoIds.length} of {COLLECTION_SIZE} photos · long-press to remove
                </Text>
              ) : (
                <Text style={styles.meta}>
                  {collection.photoIds.length} photos · curated pack
                </Text>
              )
            }
          />
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="images-outline" size={40} color={Colors.textDim} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptyText}>
              Tap the button below to pick from your gallery or paste an image URL.
            </Text>
          </View>
        )
      ) : null}

      {/* Bottom action bar — user pools only. Curated packs can't be edited. */}
      {isUserPool ? (
        <PoolFooter bottomInset={insets.bottom} onAddPress={onAddPress} />
      ) : null}
    </SafeAreaView>
  );
}
