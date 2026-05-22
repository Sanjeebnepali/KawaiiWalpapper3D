import { Ionicons } from '@expo/vector-icons';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
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
import { type CategoryPhoto } from '../../constants/mockData';
import {
  getMoodOrDefault,
  getMoodWallpapers,
  MOOD_BY_ID,
  type MoodId,
} from '../../constants/moods';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

/**
 * Mood Wallpaper Grid — `/mood/happy`, `/mood/sad`, …
 * 2-col grid (1:1.3 tiles) of wallpapers seeded from the mood id. Reuses
 * `WallpaperGridCell` so the favorite-heart + prefetch behaviour matches
 * every other grid in the app.
 */
export default function MoodGridScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.3);

  const mood = getMoodOrDefault(id);
  const photos = useMemo(() => getMoodWallpapers(mood.id, 30), [mood.id]);
  const listReady = useDeferredMount();

  const openWallpaper = useCallback(
    (pid: string) => router.push(`/wallpaper/${pid}` as Href),
    [router],
  );

  const renderItem = useCallback<ListRenderItem<CategoryPhoto>>(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        accent={mood.tint}
        width={cellW}
        height={cellH}
        onOpen={openWallpaper}
      />
    ),
    [mood.tint, cellW, cellH, openWallpaper],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.titleEmoji}>{mood.emoji}</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              {mood.label}
            </Text>
            <View
              style={[
                styles.dot,
                { backgroundColor: mood.tint, shadowColor: mood.tint },
              ]}
            />
          </View>
          <Text style={styles.subtitle}>{mood.tagline}</Text>
        </View>
        <AnimatedButton
          onPress={() => router.push('/mood/history' as Href)}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="time-outline" size={20} color={theme.text} />
        </AnimatedButton>
      </View>

      {/* Mood-switch chip row */}
      <View style={styles.chipRow}>
        {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
          const m = MOOD_BY_ID[mid];
          const active = mid === mood.id;
          return (
            <AnimatedButton
              key={mid}
              onPress={() =>
                router.replace(`/mood/${mid}` as Href)
              }
              style={[
                styles.chip,
                active && {
                  backgroundColor: m.tint,
                  borderColor: m.tint,
                },
              ]}
            >
              <Text style={styles.chipEmoji}>{m.emoji}</Text>
              <Text
                style={[
                  styles.chipText,
                  active && styles.chipTextActive,
                ]}
              >
                {m.label}
              </Text>
            </AnimatedButton>
          );
        })}
      </View>

      {listReady ? (
        <FlatList
          data={photos}
          keyExtractor={(p) => p.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
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
    paddingHorizontal: SIDE,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleEmoji: { fontSize: 22 },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: SIDE,
    paddingBottom: Spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipEmoji: { fontSize: 13 },
  chipText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  chipTextActive: { color: '#131313' },

  list: { paddingHorizontal: SIDE, paddingBottom: 140 },
});
