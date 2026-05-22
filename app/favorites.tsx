import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../components/AnimatedButton';
import { premiumAlert } from '../components/PremiumAlert';
import { WallpaperGridCell } from '../components/WallpaperGridCell';
import { getPhotoById, type FeaturedItem } from '../constants/mockData';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useDeferredMount } from '../hooks/useDeferredMount';
import { toast } from '../lib/toast';
import { useFavoritesStore } from '../store/favorites';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (p: FeaturedItem) => p.id;

/**
 * Favorites screen — a "photos page" view of every wallpaper the user has
 * hearted. Mirrors the layout of `app/theme-pack/[id].tsx` (2-col grid,
 * deferred mount, themed safe-area) so it feels like a first-class part of
 * the app rather than a tacked-on settings page.
 *
 * Each cell goes through the shared `WallpaperGridCell` so the heart
 * toggle still works in-line — un-hearting a photo removes it from the
 * grid immediately because the store is the source of truth.
 *
 * Empty state explains how to add favorites instead of just showing a blank
 * grid, and bounces the user to the Home tab if they tap "Browse".
 */
export default function FavoritesScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const favIds = useFavoritesStore((s) => s.ids);
  const clearAll = useFavoritesStore((s) => s.clear);

  // Resolve catalog ids → renderable items. Direct file:// or content://
  // URIs (rare — would only appear if a custom flow ever calls
  // toggle(uri)) pass through as a synthesized item so the grid still
  // renders them rather than dropping silently.
  const photos = useMemo<FeaturedItem[]>(() => {
    return favIds
      .map((id): FeaturedItem | null => {
        const cat = getPhotoById(id);
        if (cat) return cat;
        if (id.startsWith('file://') || id.startsWith('content://')) {
          return {
            id,
            title: 'My photo',
            tag: 'CUSTOM',
            image: id,
            accent: Colors.pink,
          };
        }
        return null;
      })
      .filter((p): p is FeaturedItem => p != null);
  }, [favIds]);

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.4);
  const listReady = useDeferredMount();

  const onOpen = useCallback(
    (pid: string) => {
      if (pid.startsWith('file://') || pid.startsWith('content://')) {
        // Direct URIs have no catalog entry → the wallpaper preview screen
        // can't resolve them. Toast instead of routing to a broken page.
        toast('Open this from its source pool to preview');
        return;
      }
      router.push(`/wallpaper/${pid}` as Href);
    },
    [router],
  );

  const renderItem: ListRenderItem<FeaturedItem> = useCallback(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        accent={item.accent}
        width={cellW}
        height={cellH}
        onOpen={onOpen}
      />
    ),
    [cellW, cellH, onOpen],
  );

  const onClearAll = useCallback(() => {
    if (favIds.length === 0) return;
    premiumAlert({
      title: 'Clear all favorites?',
      message: `Remove all ${favIds.length} hearted wallpaper${
        favIds.length === 1 ? '' : 's'
      }? This can’t be undone.`,
      icon: 'trash-outline',
      accentColor: Colors.error,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearAll();
            toast('Favorites cleared');
          },
        },
      ],
    });
  }, [favIds.length, clearAll]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>My Favorites</Text>
          <Text style={styles.subtitle}>
            {favIds.length === 0
              ? 'No hearted wallpapers yet'
              : `${favIds.length} wallpaper${favIds.length === 1 ? '' : 's'} saved`}
          </Text>
        </View>
        <AnimatedButton
          onPress={onClearAll}
          style={styles.iconBtn}
          hitSlop={8}
          disabled={favIds.length === 0}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={favIds.length === 0 ? Colors.textMute : Colors.error}
          />
        </AnimatedButton>
      </View>

      {listReady ? (
        photos.length > 0 ? (
          <FlatList
            data={photos}
            keyExtractor={keyExtractor}
            numColumns={COLS}
            columnWrapperStyle={columnWrapper}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={Separator}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
            initialNumToRender={6}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={30}
            windowSize={5}
            renderItem={renderItem}
          />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={56} color={Colors.textDim} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              No favorites yet
            </Text>
            <Text style={styles.emptyText}>
              Tap the heart on any wallpaper to save it here.
            </Text>
            <AnimatedButton
              onPress={() => router.replace('/(tabs)' as Href)}
              style={[styles.browseBtn, { backgroundColor: theme.primary }]}
            >
              <Ionicons name="grid-outline" size={16} color="#131313" />
              <Text style={styles.browseText}>Browse wallpapers</Text>
            </AnimatedButton>
          </View>
        )
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  list: { paddingHorizontal: SIDE, paddingBottom: 140 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: Spacing.sm,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.lg,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  browseText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
