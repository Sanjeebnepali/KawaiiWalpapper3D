import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { gatePremium } from '../../components/PremiumLock';
import {
  getPhotoById,
  getThemePackPhotos,
  type ThemePack,
  themePacks,
} from '../../constants/mockData';
import {
  type Collection,
  COLLECTION_SIZE,
  getCollectionIntervalMinutes,
  SHUFFLE_MODES,
  TIMER_OPTIONS,
} from '../../constants/shuffle';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';
import { applyCollectionPhoto } from '../../lib/shuffleActions';
import { toast } from '../../lib/toast';
import { otherActiveDriverLabels } from '../../lib/automationMode';
import { useSettingsStore } from '../../store/settings';
import {
  useActiveCollectionId,
  useCollections,
  useShuffleStore,
} from '../../store/shuffle';

const COLS = 2;
const GAP = 12;
const SIDE = Spacing.lg;

// Pre-pick a hero URL per built-in pack — the same URL the shuffle engine
// will apply for index 0, so the card preview matches what the user gets.
const PACK_HEROES: Record<string, string> = Object.fromEntries(
  themePacks.map((p) => [p.id, getThemePackPhotos(p.id, 1)[0]?.image ?? p.thumbs[0]]),
);

const PACK_ACCENTS = [Colors.pink, Colors.lavender, Colors.cyan, Colors.gold];

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
  const isPremium = useSettingsStore((s) => s.isPremium);
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
      // Mutual-exclusivity surfacing — activating a shuffle (the Theme
      // driver) stops every other continuous driver (Mood-based + Friend
      // check-in) via the bootstrap subscriber → `enforceSingleDriver`.
      // Capture before activation so we can toast what was paused.
      const pausedOthers = otherActiveDriverLabels('theme');
      const photoIds = getThemePackPhotos(pack.id, COLLECTION_SIZE).map(
        (p) => p.id,
      );
      const collectionId = activateBuiltinPack(pack.id, pack.title, photoIds);

      // Instant apply so the user sees their wallpaper change NOW, not
      // 60 min later when the first tick fires.
      const r = await applyCollectionPhoto(collectionId, photoIds, 0);
      if (r.ok) {
        toast(
          pausedOthers.length
            ? `▶ Shuffling "${pack.title}" · ${pausedOthers.join(' + ')} paused`
            : `▶ Now shuffling "${pack.title}"`,
        );
      } else {
        toast(r.message);
      }
      router.push('/shuffle/active');
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
    if (!canAddCollection(isPremium, 'shuffle')) {
      gatePremium(proceed);
      return;
    }
    proceed();
  }, [canAddCollection, isPremium, createCollection, router, collections]);

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

      <View style={styles.header}>
        <AnimatedButton
          onPress={() => router.back()}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            Theme Packs
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Auto-shuffle premium wallpaper sets
          </Text>
        </View>
        <AnimatedButton
          onPress={() => router.push('/shuffle/history')}
          style={styles.iconBtn}
          hitSlop={6}
        >
          <Ionicons name="time-outline" size={20} color={theme.text} />
        </AnimatedButton>
      </View>

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
                onLongPress={() =>
                  premiumAlert({
                    title: 'Delete collection',
                    message: `Delete "${c.name}"? Shuffle history is cleared.`,
                    icon: 'trash-outline',
                    accentColor: '#FF7A6E',
                    buttons: [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => {
                          try {
                            deleteCollection(c.id);
                          } catch (e) {
                            toast('Failed to delete collection');
                            console.warn('[shuffle] delete failed:', e);
                          }
                        },
                      },
                    ],
                  })
                }
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

function SectionHeader({
  title,
  caption,
  marginTop,
}: {
  title: string;
  caption: string;
  marginTop?: number;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHead, marginTop ? { marginTop } : null]}>
      <View
        style={[styles.sectionDot, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
      />
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={styles.sectionSub}>{caption}</Text>
      </View>
    </View>
  );
}

function ActiveBanner({
  collection,
  onPress,
}: {
  collection: Collection;
  onPress: () => void;
}) {
  const theme = useTheme();
  // Use the first photo as the banner backdrop for a premium glow.
  const bg = getPhotoById(collection.photoIds[0] ?? '')?.image;
  return (
    <AnimatedButton onPress={onPress} style={[styles.activeBanner, { borderColor: theme.primary }]}>
      {bg ? (
        <Image
          source={{ uri: bg }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
          blurRadius={20}
        />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.activeBannerIcon,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
        ]}
      >
        <Ionicons name="play" size={16} color="#131313" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.bannerTitle, { color: theme.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={[styles.bannerSub, { color: theme.primary }]} numberOfLines={1}>
          Live · tap to view countdown
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.text} />
    </AnimatedButton>
  );
}

function PackCard({
  pack,
  hero,
  accent,
  width,
  height,
  isActive,
  onView,
  onShuffle,
  onConfigure,
}: {
  pack: ThemePack;
  hero: string;
  accent: string;
  width: number;
  height: number;
  isActive: boolean;
  onView: () => void;
  onShuffle: () => void;
  onConfigure: () => void;
}) {
  return (
    <View
      style={[
        styles.packCard,
        { width, height },
        isActive && { borderColor: accent, borderWidth: 1.5 },
      ]}
    >
      {/* Long-press anywhere on the card opens the edit screen (creates the
          backing Collection if needed) so the user can tweak timer / mode
          before — or after — starting the shuffle. */}
      <AnimatedButton
        onPress={onView}
        onLongPress={onConfigure}
        style={StyleSheet.absoluteFill}
        scaleTo={0.98}
      >
        <Image
          source={{ uri: hero }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.92)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={[accent, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.packAccentStrip}
        />
      </AnimatedButton>

      <View style={styles.packTopRow} pointerEvents="none">
        <View style={[styles.countPill, { borderColor: accent }]}>
          <Ionicons name="images" size={9} color={accent} />
          <Text style={[styles.countPillText, { color: accent }]}>
            {pack.count}
          </Text>
        </View>
        {isActive ? (
          <View style={[styles.livePill, { backgroundColor: accent }]}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillText}>LIVE</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.packBottom}>
        <Text style={styles.packTitle} numberOfLines={1}>
          {pack.title}
        </Text>
        <Text style={styles.packSub} numberOfLines={1}>
          {pack.count} wallpapers
        </Text>
        <View style={styles.packActions}>
          <AnimatedButton
            onPress={onShuffle}
            style={[
              styles.shuffleCta,
              {
                backgroundColor: isActive ? 'rgba(255,255,255,0.12)' : accent,
                borderColor: accent,
              },
            ]}
            scaleTo={0.94}
          >
            <Ionicons
              name={isActive ? 'sync' : 'play'}
              size={13}
              color={isActive ? accent : '#131313'}
            />
            <Text
              style={[
                styles.shuffleCtaText,
                { color: isActive ? accent : '#131313' },
              ]}
            >
              {isActive ? 'Shuffling' : 'Shuffle'}
            </Text>
          </AnimatedButton>
          {/* Active pack → opens edit screen so the user can tweak the
              timer / mode / etc. (Issue: built-in packs were previously
              uneditable — changes/024). Inactive pack → opens the
              read-only album browser. */}
          <AnimatedButton
            onPress={isActive ? onConfigure : onView}
            style={styles.viewCta}
            hitSlop={6}
            scaleTo={0.9}
          >
            <Ionicons
              name={isActive ? 'settings-outline' : 'albums-outline'}
              size={14}
              color="#FFF"
            />
          </AnimatedButton>
        </View>
      </View>
    </View>
  );
}

function UserCollectionRow({
  collection,
  active,
  onPress,
  onLongPress,
}: {
  collection: Collection;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const hero = getPhotoById(collection.photoIds[0] ?? '')?.image;
  const mode = SHUFFLE_MODES.find((m) => m.id === collection.mode);
  const timer = TIMER_OPTIONS.find((t) => t.id === collection.timerId);
  const minutes = getCollectionIntervalMinutes(collection);
  // Day-based ignores the timer (it rotates at midnight), so label it as
  // such instead of a misleading "Every N min".
  const timerLabel =
    collection.mode === 'day'
      ? 'Daily'
      : timer?.id === 'custom'
        ? `${minutes} min`
        : timer?.label ?? `${minutes} min`;

  return (
    <AnimatedButton
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.userRow,
        active && { borderColor: theme.primary, borderWidth: 1.5 },
      ]}
      scaleTo={0.98}
    >
      {hero ? (
        <Image
          source={{ uri: hero }}
          style={styles.userHero}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.userHero, styles.userHeroEmpty]}>
          <Ionicons name="image-outline" size={20} color={Colors.textDim} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.userHeroFade}
        pointerEvents="none"
      />

      <View style={styles.userBody}>
        <View style={styles.userTitleRow}>
          <Text style={[styles.userTitle, { color: theme.text }]} numberOfLines={1}>
            {collection.name}
          </Text>
          {active ? (
            <View style={[styles.livePill, { backgroundColor: theme.primary }]}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.userMetaRow}>
          <View style={styles.userMetaChip}>
            <Ionicons name="images-outline" size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{collection.photoIds.length}/{COLLECTION_SIZE}</Text>
          </View>
          <View style={styles.userMetaChip}>
            <Ionicons name={mode?.icon ?? 'shuffle'} size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{mode?.label ?? 'Sequential'}</Text>
          </View>
          <View style={styles.userMetaChip}>
            <Ionicons name="time-outline" size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{timerLabel}</Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
    </AnimatedButton>
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
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  scroll: {
    paddingHorizontal: SIDE,
    paddingBottom: 140,
    gap: Spacing.md,
  },

  // Active banner
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  activeBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  bannerSub: { fontSize: 11, fontWeight: '800', marginTop: 2, letterSpacing: 0.4 },

  // Section headers
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  sectionSub: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },

  // Pack grid
  packGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  packCard: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  packAccentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.9,
  },
  packTopRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  countPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#131313',
  },
  livePillText: {
    color: '#131313',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  packBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 2,
  },
  packTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  packSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' },
  packActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  shuffleCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  shuffleCtaText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  viewCta: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },

  // User collections empty state
  emptyCard: {
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptySub: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },

  // User collection rows
  userRow: {
    position: 'relative',
    height: 86,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.md,
  },
  userHero: {
    width: 112,
    height: '100%',
    backgroundColor: Colors.surfaceHi,
  },
  userHeroEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userHeroFade: {
    position: 'absolute',
    left: 80,
    width: 50,
    top: 0,
    bottom: 0,
  },
  userBody: { flex: 1, paddingLeft: Spacing.md, gap: 6 },
  userTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userTitle: { flex: 1, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  userMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceHi,
  },
  userMetaText: { color: Colors.textDim, fontSize: 10, fontWeight: '700' },

  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: Spacing.sm,
  },
  createBtnText: { fontSize: 13, fontWeight: '800' },
});
