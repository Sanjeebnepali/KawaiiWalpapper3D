import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { gatePremium } from '../../components/PremiumLock';
import { premiumAlert } from '../../components/PremiumAlert';
import { WallpaperGridCell } from '../../components/WallpaperGridCell';
import {
  getThemePackById,
  getThemePackPhotos,
  type CategoryPhoto,
} from '../../constants/mockData';
import {
  getCollectionIntervalMinutes,
  TIMER_OPTIONS,
} from '../../constants/shuffle';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';
import { useSettingsStore } from '../../store/settings';
import { useShuffleStore } from '../../store/shuffle';
import { applyCollectionPhoto } from '../../lib/shuffleActions';
import { toast } from '../../lib/toast';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (p: CategoryPhoto) => p.id;

export default function ThemePackDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const pack = getThemePackById(id ?? '');
  const photos = useMemo(
    () => getThemePackPhotos(id ?? 'pack', pack?.count ?? 12),
    [id, pack?.count],
  );
  const photoIds = useMemo(() => photos.map((p) => p.id), [photos]);

  // ─── Auto-shuffle wiring ─────────────────────────────────────────────────
  // The user's complaint: "I select gallery album from app/theme-pack/ and
  // choose to shuffle every 5 min, it counts then stops when I close the
  // app." Two underlying issues — (a) this screen had NO shuffle CTA, so
  // the user had to backtrack through wallpapers/theme-packs.tsx, and
  // (b) the native FGS that survives app-close wasn't autolinked. Both
  // fixed: the CTA below activates the pack via the shuffle store, the
  // bootstrap subscriber in lib/moodBootstrap.ts then kicks off the native
  // foreground service so the rotation survives OEM background killers.
  const activeCollectionId = useShuffleStore((s) => s.activeCollectionId);
  const collections = useShuffleStore((s) => s.collections);
  const activeForThisPack = useMemo(() => {
    if (!id || !activeCollectionId) return null;
    const c = collections.find((c) => c.id === activeCollectionId);
    return c?.seedPackId === id ? c : null;
  }, [id, activeCollectionId, collections]);
  const ensureBuiltinPackCollection = useShuffleStore(
    (s) => s.ensureBuiltinPackCollection,
  );
  const updateCollection = useShuffleStore((s) => s.updateCollection);
  const setActive = useShuffleStore((s) => s.setActive);
  const isPremium = useSettingsStore((s) => s.isPremium);

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.4);
  const listReady = useDeferredMount();

  const onOpen = useCallback(
    (pid: string) => router.push(`/wallpaper/${pid}`),
    [router],
  );

  const renderItem: ListRenderItem<CategoryPhoto> = useCallback(
    ({ item }) => (
      <WallpaperGridCell
        id={item.id}
        image={item.image}
        width={cellW}
        height={cellH}
        onOpen={onOpen}
      />
    ),
    [cellW, cellH, onOpen],
  );

  const onPickInterval = useCallback(() => {
    if (!id || !pack) return;
    // Build the timer-button list. Premium options are visually marked
    // and gated by gatePremium when tapped — same convention used in the
    // rest of the app's interval-picker UIs.
    const buttons = TIMER_OPTIONS.filter((t) => t.minutes != null).map((t) => ({
      text: t.premium && !isPremium ? `${t.label} · 💎` : t.label,
      onPress: () => {
        const apply = () => {
          // Three-step activation, in this exact order to avoid an
          // FGS double-start:
          //   1. Materialize the collection (or fetch the existing one)
          //      WITHOUT touching activeCollectionId.
          //   2. Patch the timer on it.
          //   3. setActive — this is the single moment the bootstrap
          //      subscriber sees the activeCollectionId flip, and it
          //      reads the (already-patched) timer when starting the
          //      native FGS.
          // The mutual-exclusion subscriber pauses mood-bg if it was on
          // (mood + shuffle both write the wallpaper — only one runs).
          const cid = ensureBuiltinPackCollection(id, pack.title, photoIds);
          updateCollection(cid, { timerId: t.id });
          setActive(cid);
          // Instant feedback — apply photo at index 0 right now so the
          // user sees something change immediately.
          void applyCollectionPhoto(cid, photoIds, 0).then((r) => {
            if (r.ok) {
              toast(`✓ Auto-shuffle on · every ${t.label}`);
            } else {
              toast(`Started · ${r.message}`);
            }
          });
        };
        if (t.premium && !isPremium) {
          gatePremium(apply);
        } else {
          apply();
        }
      },
    }));

    premiumAlert({
      title: activeForThisPack ? 'Change interval' : 'Start auto-shuffle',
      message: activeForThisPack
        ? 'Rotation already running. Pick a new interval to update.'
        : 'How often should the wallpaper change?',
      icon: 'shuffle',
      buttons: [...buttons, { text: 'Cancel', style: 'cancel' }],
    });
  }, [
    id,
    pack,
    photoIds,
    ensureBuiltinPackCollection,
    updateCollection,
    setActive,
    activeForThisPack,
    isPremium,
  ]);

  const onStopShuffle = useCallback(() => {
    setActive(null);
    toast('Auto-shuffle stopped');
  }, [setActive]);

  const intervalLabel = activeForThisPack
    ? activeForThisPack.mode === 'day'
      ? 'New wallpaper daily'
      : `Every ${getCollectionIntervalMinutes(activeForThisPack)} min`
    : null;

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
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {pack?.title ?? 'Theme Pack'}
        </Text>
      </View>

      {/* Shuffle CTA — primary action on this screen. */}
      <View style={styles.ctaRow}>
        <AnimatedButton
          onPress={onPickInterval}
          style={[
            styles.ctaPrimary,
            { backgroundColor: theme.primary },
          ]}
        >
          <Ionicons
            name={activeForThisPack ? 'shuffle' : 'shuffle-outline'}
            size={18}
            color="#131313"
          />
          <Text style={styles.ctaPrimaryText}>
            {activeForThisPack
              ? `Auto-shuffle · ${intervalLabel}`
              : 'Start auto-shuffle'}
          </Text>
        </AnimatedButton>
        {activeForThisPack ? (
          <AnimatedButton
            onPress={onStopShuffle}
            style={styles.ctaStop}
            hitSlop={8}
          >
            <Ionicons name="stop" size={16} color={theme.text} />
          </AnimatedButton>
        ) : null}
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
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  ctaPrimary: {
    flex: 1,
    height: 44,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaPrimaryText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  ctaStop: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
});
