import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { AnimatedButton } from '../../components/AnimatedButton';
import { WallpaperGridCell } from '../../components/WallpaperGridCell';
import { twoDSections, type CatalogPhoto } from '../../constants/wallpaperCatalog';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (p: CatalogPhoto) => p.id;

/**
 * 2D Kawaii — the section that replaced Video Wallpapers. Flattens every 2D
 * section into one 2-column grid of the owner's real 2D-style wallpapers.
 */
export default function TwoDKawaiiScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const listReady = useDeferredMount();

  const photos = useMemo(() => twoDSections.flatMap((s) => s.photos), []);
  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.5); // portrait wallpaper crop

  const openWallpaper = useCallback(
    (pid: string) => router.push(`/wallpaper/${pid}`),
    [router],
  );
  const noop = useCallback(() => {}, []);

  const renderItem = useCallback<ListRenderItem<CatalogPhoto>>(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        accent={theme.primary}
        width={cellW}
        height={cellH}
        onOpen={openWallpaper}
        onLongPress={noop}
      />
    ),
    [theme.primary, cellW, cellH, openWallpaper, noop],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          2D Kawaii
        </Text>
        <View style={[styles.dot, { backgroundColor: theme.primary, shadowColor: theme.primary }]} />
      </View>

      {listReady ? (
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
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
});
