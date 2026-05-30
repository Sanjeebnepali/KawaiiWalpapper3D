import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { gateFeature } from '../../components/PremiumLock';
import { ActiveBanner } from '../../components/themePacks/ActiveBanner';
import { PackCard } from '../../components/themePacks/PackCard';
import { SectionHeader } from '../../components/themePacks/SectionHeader';
import { COLS, GAP, SIDE, styles } from '../../components/themePacks/styles';
import { ThemePacksHeader } from '../../components/themePacks/ThemePacksHeader';
import { UserCollectionRow } from '../../components/themePacks/UserCollectionRow';
import {
  getThemePackPhotos,
  type ThemePack,
  themePacks,
} from '../../constants/mockData';
import {
  COLLECTION_SIZE,
} from '../../constants/shuffle';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';
import { applyCollectionPhoto } from '../../lib/shuffleActions';
import { toast } from '../../lib/toast';
import { confirmDriverSwitch } from '../../lib/confirmDriverSwitch';
import { confirmDeleteCollection } from '../../lib/themePackActions';
import { PACK_ACCENTS, PACK_HEROES } from '../../lib/themePackHeroes';
import { useEntitlement } from '../../lib/billing';
import {
  useActiveCollectionId,
  useCollections,
  useShuffleStore,
} from '../../store/shuffle';

/**
 * Theme Packs — premium-styled hub for Auto Shuffle (changes/023).
 * Two sections in a ScrollView:
 *
 *   1. Quick Start — built-in `themePacks` rendered as hero portrait cards
 *      (3:4 aspect) with a glass footer (title + Shuffle CTA). Tap the hero
 *      to view the pack detail; tap Shuffle to start auto-rotation.
 *   2. My Collections — user-built custom collections with a parallel
 *      premium row treatment + dashed "Create" button.
 *
 * "Shuffle" applies the first photo IMMEDIATELY (changes/023). Without that,
 * the first wallpaper change wouldn't happen until the next timer tick
 * (60+ min on default interval) and the user would think the feature is
 * broken.
 */
export default function ThemePacksScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cardH = Math.round(cardW * 1.32);

  const collections = useCollections();
  const activeId = useActiveCollectionId();
  const hasThemePacks = useEntitlement('themePacks');
  const hydrated = useShuffleStore((s) => s.hydrated);
  const hydrate = useShuffleStore((s) => s.hydrate);
  const createCollection = useShuffleStore((s) => s.createCollection);
  const canAddCollection = useShuffleStore((s) => s.canAddCollection);
  const deleteCollection = useShuffleStore((s) => s.deleteCollection);
  const activateBuiltinPack = useShuffleStore((s) => s.activateBuiltinPack);
  const ensureBuiltinPackCollection = useShuffleStore(
    (s) => s.ensureBuiltinPackCollection,
  );

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  // Defer body mount until after the stack push animation completes —
  // the 6 hero cards each have an Image + 2 LinearGradients + a
  // pack-actions row, which together block the push for ~800 ms on
  // mid-range Android. See hooks/useDeferredMount.
  const bodyReady = useDeferredMount();

  const onShufflePack = useCallback(
    async (pack: ThemePack) => {
      // Mutual exclusivity — activating a shuffle (the Theme driver) stops
      // every other continuous driver (Mood-based + Friend check-in) via the
      // bootstrap subscriber → `enforceSingleDriver`. Confirm BEFORE switching
      // so the pause is never silent (changes/189); `confirmDriverSwitch` runs
      // the activation immediately when nothing else is active (no dialog).
      confirmDriverSwitch({
        keep: 'theme',
        enablingLabel: `"${pack.title}" shuffle`,
        onConfirm: () => {
          const photoIds = getThemePackPhotos(pack.id, COLLECTION_SIZE).map(
            (p) => p.id,
          );
          const collectionId = activateBuiltinPack(pack.id, pack.title, photoIds);

          // Instant apply so the user sees their wallpaper change NOW, not
          // 60 min later when the first tick fires.
          void applyCollectionPhoto(collectionId, photoIds, 0).then((r) => {
            toast(r.ok ? `▶ Now shuffling "${pack.title}"` : r.message);
          });
          router.push('/shuffle/active');
        },
      });
    },
    [activateBuiltinPack, router],
  );

  const onViewPack = useCallback(
    (pack: ThemePack) => router.push(`/theme-pack/${pack.id}` as Href),
    [router],
  );

  // Open the edit screen for a built-in pack. Creates the backing
  // Collection lazily (without activating) so the user can change timer /
  // mode / etc. before tapping Shuffle for the first time. Reuses the
  // existing Collection if one already exists for this pack.
  const onConfigurePack = useCallback(
    (pack: ThemePack) => {
      const photoIds = getThemePackPhotos(pack.id, COLLECTION_SIZE).map(
        (p) => p.id,
      );
      const collectionId = ensureBuiltinPackCollection(
        pack.id,
        pack.title,
        photoIds,
      );
      router.push(`/shuffle/${collectionId}` as Href);
    },
    [ensureBuiltinPackCollection, router],
  );

  const onCreateCustom = useCallback(() => {
    const proceed = () => {
      // Count only shuffle-purpose collections for the auto-name index so
      // mood pools don't bump the number visible here (they belong to a
      // different surface).
      const idx = collections.filter(
        (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'shuffle',
      ).length + 1;
      const c = createCollection(`Collection ${idx}`, 'shuffle');
      router.push(`/shuffle/${c.id}`);
    };
    if (!canAddCollection(hasThemePacks, 'shuffle')) {
      gateFeature('themePacks', proceed);
      return;
    }
    proceed();
  }, [canAddCollection, hasThemePacks, createCollection, router, collections]);

  // Only shuffle-purpose user collections live in this hub. Mood pools
  // (built via the Mood tab's Create flow) have purpose: 'mood' and are
  // intentionally hidden here so the two surfaces feel like separate
  // libraries. Built-in seeded packs (seedPackId set) ignore purpose and
  // appear in both surfaces — they're curated content, not user pools.
  const userCollections = useMemo(
    () =>
      collections.filter(
        (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'shuffle',
      ),
    [collections],
  );
  const activeCollection = useMemo(
    () => (activeId ? collections.find((c) => c.id === activeId) ?? null : null),
    [activeId, collections],
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <StatusBar style="light" />

      <ThemePacksHeader
        onBack={() => router.back()}
        onHistory={() => router.push('/shuffle/history')}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!bodyReady ? null : (
        <>
        {activeCollection ? (
          <ActiveBanner
            collection={activeCollection}
            onPress={() => router.push('/shuffle/active')}
          />
        ) : null}

        {/* ────────── Quick Start ────────── */}

        <SectionHeader
          title="Quick Start"
          caption="One-tap shuffle from curated packs"
        />

        <View style={styles.packGrid}>
          {themePacks.map((pack, i) => {
            const matching = collections.find((c) => c.seedPackId === pack.id);
            const isActive = !!matching && matching.id === activeId;
            const accent = PACK_ACCENTS[i % PACK_ACCENTS.length];
            return (
              <PackCard
                key={pack.id}
                pack={pack}
                hero={PACK_HEROES[pack.id]}
                accent={accent}
                width={cardW}
                height={cardH}
                isActive={isActive}
                onView={() => onViewPack(pack)}
                onShuffle={() => onShufflePack(pack)}
                onConfigure={() => onConfigurePack(pack)}
              />
            );
          })}
        </View>

        {/* ────────── My Collections ────────── */}

        <SectionHeader
          title="My Collections"
          caption="Build a 10-wallpaper set from any photo in the app"
          marginTop={Spacing.xl}
        />

        {userCollections.length === 0 ? (
          <View style={styles.emptyCard}>
            <View
              style={[
                styles.emptyIconWrap,
                { borderColor: theme.primary, shadowColor: theme.primary },
              ]}
            >
              <Ionicons name="albums" size={22} color={theme.primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Make it yours
            </Text>
            <Text style={styles.emptySub}>
              Pick 10 favorite wallpapers, choose a timer, and let the app
              cycle them for you.
            </Text>
          </View>
        ) : (
          <View style={{ gap: Spacing.sm }}>
            {userCollections.map((c) => (
              <UserCollectionRow
                key={c.id}
                collection={c}
                active={c.id === activeId}
                onPress={() => router.push(`/shuffle/${c.id}`)}
                onLongPress={() => confirmDeleteCollection(c, deleteCollection)}
              />
            ))}
          </View>
        )}

        <AnimatedButton
          onPress={onCreateCustom}
          style={[styles.createBtn, { borderColor: theme.primary }]}
        >
          <Ionicons name="add-circle" size={18} color={theme.primary} />
          <Text style={[styles.createBtnText, { color: theme.primary }]}>
            Create custom collection
          </Text>
        </AnimatedButton>
        </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
