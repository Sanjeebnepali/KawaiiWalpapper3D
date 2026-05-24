import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { premiumAlert } from '../../components/PremiumAlert';
import { AnimatedButton } from '../../components/AnimatedButton';
import { WallpaperGridCell } from '../../components/WallpaperGridCell';
import { browseMeta, type CategoryPhoto } from '../../constants/mockData';
import { isPremiumPhotoId } from '../../constants/premiumCatalog';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';
import { useFetchWallpapers } from '../../hooks/useFetchWallpapers';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (p: CategoryPhoto) => p.id;

export default function CategoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const browseId = id ?? '';
  const meta = browseMeta(browseId);

  const { wallpapers, loading, error, refetch } = useFetchWallpapers(browseId, 30);
  const listReady = useDeferredMount();

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.5); // portrait wallpaper crop — premium feel

  // Stable callbacks so the memoized WallpaperGridCells don't re-render.
  const openWallpaper = useCallback(
    (pid: string) => router.push(`/wallpaper/${pid}`),
    [router],
  );
  const onLongPressDownload = useCallback((pid: string) => {
    premiumAlert({
      title: 'Save wallpaper',
      message: `Download ${pid} to your gallery?`,
      icon: 'download-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Download', onPress: () => {} },
      ],
    });
  }, []);

  // Stable renderItem — re-creating this inline on every parent render
  // changes the function identity each frame, which forces every
  // memo(WallpaperGridCell) to re-render even when nothing about a row
  // changed. Pulling it up + useCallback keeps the memo intact.
  const renderItem = useCallback<ListRenderItem<CategoryPhoto>>(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        accent={meta.accent}
        width={cellW}
        height={cellH}
        premium={isPremiumPhotoId(item.id)}
        onOpen={openWallpaper}
        onLongPress={onLongPressDownload}
      />
    ),
    [meta.accent, cellW, cellH, openWallpaper, onLongPressDownload],
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {meta.title} Wallpapers
        </Text>
        <View
          style={[
            styles.dot,
            { backgroundColor: meta.accent, shadowColor: meta.accent },
          ]}
        />
      </View>

      {loading ? (
        <View style={styles.stateWrap}>
          <ActivityIndicator color={Colors.pink} size="large" />
          <Text style={styles.stateText}>Loading wallpapers…</Text>
        </View>
      ) : error ? (
        <View style={styles.stateWrap}>
          <Ionicons name="cloud-offline-outline" size={32} color={Colors.textDim} />
          <Text style={styles.stateText}>{error}</Text>
          <AnimatedButton onPress={refetch} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </AnimatedButton>
        </View>
      ) : listReady ? (
        <FlatList
          data={wallpapers}
          keyExtractor={keyExtractor}
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
        />
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingBottom: 80,
  },
  stateText: { color: Colors.textDim, fontSize: 13, fontWeight: '600' },
  retryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    backgroundColor: Colors.pink,
  },
  retryText: { color: '#131313', fontSize: 13, fontWeight: '800' },
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
});
