import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import {
  FlatList,
  type ListRenderItem,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BestPicksGrid } from '../../components/BestPicksGrid';
import { CategoryIcons } from '../../components/CategoryIcons';
import { CategoryPreviewList } from '../../components/CategoryPreviewList';
import { CollectionGrid } from '../../components/CollectionGrid';
import { FeaturedCarousel } from '../../components/FeaturedCarousel';
import { Header } from '../../components/Header';
import { SectionTitle } from '../../components/SectionTitle';
import { ThemeBasedRow } from '../../components/ThemeBasedRow';
import { TopTabs } from '../../components/TopTabs';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

// Home was previously a ScrollView containing every section eagerly — ~30
// images + 50 AnimatedButtons mounted on first Home focus, blocking the JS
// thread for ~1 s on mid-range Android. Switching to FlatList with one
// section per row makes off-screen sections (Featured / Theme Based /
// Collections) mount only as the user scrolls toward them.
type Section = { id: string; render: () => ReactElement };

export default function WallpapersHome() {
  const router = useRouter();
  const theme = useTheme();

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('light-content');
      StatusBar.setBackgroundColor(theme.bg);
      StatusBar.setTranslucent(false);
    }
  }, [theme.bg]);

  // "See all" targets now point at real catalog destinations:
  //   Featured     → a content-rich category
  //   Theme Based  → the 2D Kawaii screen (these cards ARE 2D sets)
  //   Collections  → the Mood tab (collections ARE the mood/emotion sets)
  const goFeatured = useCallback(() => router.push('/category/stylish'), [router]);
  const goTwoD = useCallback(() => router.push('/wallpapers/2d-kawaii'), [router]);
  const goMoods = useCallback(() => router.push('/mood'), [router]);
  // "Best Fit" See all browses FREE picks (mixed normal images) — premium is
  // its own tab, never mixed into this free area.
  const goBestFit = useCallback(() => router.push('/category/bestfit'), [router]);

  const sections = useMemo<Section[]>(
    () => [
      { id: 'icons', render: () => <CategoryIcons /> },
      { id: 'previews', render: () => <CategoryPreviewList /> },
      {
        id: 'featured-title',
        render: () => (
          <SectionTitle
            title="Featured"
            caption="Hand-picked drops"
            onSeeAll={goFeatured}
          />
        ),
      },
      { id: 'featured', render: () => <FeaturedCarousel /> },
      {
        id: 'themes-title',
        render: () => (
          <SectionTitle
            title="2D Kawaii"
            caption="Flat, cute & premium"
            onSeeAll={goTwoD}
          />
        ),
      },
      { id: 'themes', render: () => <ThemeBasedRow /> },
      {
        id: 'collections-title',
        render: () => (
          <SectionTitle
            title="Moods"
            caption="Browse by feeling"
            onSeeAll={goMoods}
          />
        ),
      },
      { id: 'collections', render: () => <CollectionGrid /> },
      // Premium section — placed after the album/theme rows. Shows the
      // curated best for now; owner will upload dedicated premium photos
      // here (then we repoint PREMIUM_SECTION in mockData).
      {
        id: 'premium-title',
        render: () => (
          <SectionTitle
            title="Best Fit"
            caption="Picked to fit your screen"
            onSeeAll={goBestFit}
          />
        ),
      },
      { id: 'premium', render: () => <BestPicksGrid /> },
    ],
    [goFeatured, goTwoD, goMoods, goBestFit],
  );

  const renderItem: ListRenderItem<Section> = useCallback(
    ({ item }) => item.render(),
    [],
  );

  const keyExtractor = useCallback((item: Section) => item.id, []);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      {/* Fixed top bar. Header + TopTabs USED to be the FlatList's sticky
          ListHeaderComponent, but a horizontal ScrollView of Pressables
          nested inside an Android sticky header drops/steals taps right
          after a vertical scroll — the user couldn't reliably tap
          2D Kawaii / Dual / Theme Packs. As a fixed sibling above the list
          they stay pinned at the top (same look as the sticky header) and
          receive taps cleanly, decoupled from the list's scroll responder. */}
      <View style={[styles.topBar, { backgroundColor: theme.bg }]}>
        <Header />
        <TopTabs />
      </View>
      <FlatList
        style={styles.list}
        data={sections}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        // Virtualization tuned for ~8 section rows where the heaviest two
        // (Featured + Collections) sit below the fold. Mount the first 3
        // immediately, then let the rest stream in as the user scrolls.
        initialNumToRender={3}
        maxToRenderPerBatch={2}
        updateCellsBatchingPeriod={50}
        windowSize={5}
        // NOT setting removeClippedSubviews — it conflicts with the sticky
        // ListHeaderComponent on Android and can manifest as the
        // "Can't perform a React state update on a component that hasn't
        // mounted yet" warning when a clipped subview's effect tries to
        // hydrate. Each section is already a memoized component, so the
        // virtualization window alone is enough.
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  list: { flex: 1 },
  scroll: { paddingBottom: 140 },
  topBar: { backgroundColor: Colors.bg },
});
