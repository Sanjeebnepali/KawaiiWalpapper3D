import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../components/AnimatedButton';
import { WallpaperGridCell } from '../components/WallpaperGridCell';
import {
  type SearchableWallpaper,
  searchCategories,
  searchWallpapers,
} from '../constants/mockData';
import { Colors, Radius, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useFilter } from '../hooks/useFilter';
import { useSearch } from '../hooks/useSearch';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

/**
 * Dedicated search screen (Task 6). Real-time filtering of the unified
 * `searchCatalog` by free-text query (title + tags) and multi-select
 * category chips, with a "no results" empty state.
 */
export default function SearchScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { query, setQuery, debounced, clear: clearQuery } = useSearch();
  const filter = useFilter();

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.5); // portrait wallpaper crop (was 1:1 square)

  const results = useMemo(
    () => searchWallpapers(debounced, filter.selected),
    [debounced, filter.selected],
  );

  const openWallpaper = useCallback(
    (id: string) => router.push(`/wallpaper/${id}`),
    [router],
  );

  const renderItem = useCallback<ListRenderItem<SearchableWallpaper>>(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        title={item.title}
        accent={item.accent}
        width={cellW}
        height={cellH}
        onOpen={openWallpaper}
      />
    ),
    [cellW, cellH, openWallpaper],
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
          hitSlop={8}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={Colors.textDim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Search kawaii wallpapers"
            placeholderTextColor={Colors.textMute}
            style={styles.searchInput}
            cursorColor={Colors.pink}
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <Pressable onPress={clearQuery} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.textDim} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.chipBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {searchCategories.map((cat) => {
            const active = filter.isActive(cat);
            return (
              <AnimatedButton
                key={cat}
                onPress={() => filter.toggle(cat)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {cat}
                </Text>
              </AnimatedButton>
            );
          })}
        </ScrollView>
        {filter.count > 0 ? (
          <Pressable onPress={filter.clear} hitSlop={8} style={styles.clearAll}>
            <Text style={styles.clearAllText}>Clear All</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.resultMeta}>
        {results.length} {results.length === 1 ? 'result' : 'results'}
        {filter.count > 0
          ? ` · ${filter.count} filter${filter.count === 1 ? '' : 's'}`
          : ''}
      </Text>

      {results.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="sad-outline" size={38} color={Colors.textDim} />
          <Text style={styles.emptyTitle}>No results</Text>
          <Text style={styles.emptyText}>
            Try a different keyword or clear your filters.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(w) => w.id}
          numColumns={COLS}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={50}
          windowSize={5}
          renderItem={renderItem}
        />
      )}
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
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: 44,
    borderRadius: 24,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, padding: 0 },
  chipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.sm,
    gap: Spacing.sm,
  },
  chipRow: { gap: Spacing.sm, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  chipText: { color: Colors.textDim, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#131313' },
  clearAll: { paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  clearAllText: { color: Colors.pink, fontSize: 12, fontWeight: '800' },
  resultMeta: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingBottom: 80,
  },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '800' },
  emptyText: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
});
