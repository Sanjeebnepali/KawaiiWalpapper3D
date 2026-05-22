import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { MOOD_BY_ID, type MoodId } from '../../constants/moods';
import { getPhotoById, getThemePackPhotos, moodAlbums } from '../../constants/mockData';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { tallyMoodBuckets } from '../../lib/moodBucket';
import { hydrateMoodStore, useMoodStore } from '../../store/mood';
import { useCollections, useShuffleStore } from '../../store/shuffle';
import { useSettingsStore } from '../../store/settings';
import { gatePremium } from '../../components/PremiumLock';
import { premiumAlert } from '../../components/PremiumAlert';

/**
 * Per-route Expo Router error boundary. Replaces the previous behaviour
 * where a render-time throw from this screen (most reliably reproduced by
 * the user via "Build full album → blank flash → back to phone launcher")
 * would crash the whole JS bundle and drop the user at the OS home screen.
 *
 * Returning a salvageable screen lets the user back out instead of force-
 * killing the app, and the `console.warn` leaves a logcat trail to find
 * the underlying cause on the next repro.
 */
export function ErrorBoundary({
  error,
  retry,
}: {
  error: Error;
  retry: () => Promise<void>;
}) {
  console.warn('[mood/pick-collection] render crash:', error);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: Colors.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <View style={styles.errorWrap}>
        <Ionicons name="alert-circle" size={48} color={Colors.error} />
        <Text style={styles.errorTitle}>Couldn’t open the pool picker</Text>
        <Text style={styles.errorMsg}>
          {error?.message ?? 'Something went wrong while loading your pools.'}
        </Text>
        <AnimatedButton
          onPress={() => {
            void retry();
          }}
          style={[styles.errorBtn, { borderColor: Colors.pink }]}
        >
          <Text style={[styles.errorBtnText, { color: Colors.pink }]}>Try again</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

/**
 * Mood Mode — Collection picker.
 *
 * Lists every available pool the user can drive Mood Mode from:
 *   1. User-built Collections (`!seedPackId`)
 *   2. Activated built-in theme packs
 *   3. Inactive built-in theme packs (tappable → `activateBuiltinPack`)
 *
 * Each row shows a hero thumb, name, photo count, and a 7-mood balance bar
 * so the user sees at a glance whether their pool covers every emotion the
 * detector could throw at it.
 */
export default function MoodPickCollection() {
  const router = useRouter();
  const theme = useTheme();

  const hydrated = useMoodStore((s) => s.hydrated);
  const setMoodCollection = useMoodStore((s) => s.setMoodCollection);
  const activeCollectionId = useMoodStore((s) => s.moodCollectionId);

  const collections = useCollections();
  // IMPORTANT: use `ensureBuiltinPackCollection`, NOT `activateBuiltinPack`.
  // The latter sets the pack as the SHUFFLE active collection, which trips
  // the mutual-exclusion subscriber in lib/moodBootstrap.ts and silently
  // turns OFF backgroundEnabled. From the user's side that looks like
  // "I can't re-select my album" — actually the pick succeeds but the
  // mood-bg engine is torn down in the same frame. Mood and Shuffle are
  // independent "active" pointers; mood-picker must only set MOOD's.
  const ensureBuiltinPackCollection = useShuffleStore(
    (s) => s.ensureBuiltinPackCollection,
  );
  const createCollection = useShuffleStore((s) => s.createCollection);
  const canAddCollection = useShuffleStore((s) => s.canAddCollection);
  const isPremium = useSettingsStore((s) => s.isPremium);

  useEffect(() => {
    if (!hydrated) hydrateMoodStore();
  }, [hydrated]);

  // Sort: active first, then user collections, then built-in packs (activated
  // and inactive interleaved). Only mood-purpose user collections appear
  // here — the shuffle hub owns its own custom collections separately.
  //
  // Defensive against malformed store entries (audit: "Build full album →
  // crash to launcher" report): a single collection with `photoIds:
  // undefined` (legacy hydration path) used to throw inside
  // `tallyMoodBuckets`, killing the whole row map and bubbling up to the
  // route-level error boundary. We now coerce to an array and skip rows
  // that lack the minimum shape.
  const allRows = useMemo<PickRow[]>(() => {
    const safeCollections = Array.isArray(collections) ? collections : [];

    const userRows: PickRow[] = safeCollections
      .filter(
        (c) =>
          c != null &&
          typeof c.id === 'string' &&
          !c.seedPackId &&
          c.purpose === 'mood',
      )
      .map((c) => {
        const photoIds = Array.isArray(c.photoIds) ? c.photoIds : [];
        return {
          kind: 'collection',
          id: c.id,
          name: c.name ?? 'Untitled pool',
          photoIds,
          thumb: photoThumb(photoIds),
        } as PickRow;
      });

    const activatedSeeds = new Set(
      safeCollections
        .filter((c) => c != null && c.seedPackId)
        .map((c) => c.seedPackId!),
    );

    const safePacks = Array.isArray(moodAlbums) ? moodAlbums : [];
    const packRows: PickRow[] = safePacks
      .filter((p) => p != null && typeof p.id === 'string')
      .map((p) => {
        const existing = safeCollections.find(
          (c) => c != null && c.seedPackId === p.id,
        );
        const photoIds =
          existing?.photoIds && Array.isArray(existing.photoIds)
            ? existing.photoIds
            : getThemePackPhotos(p.id, 10)?.map((x) => x.id) ?? [];
        const headPhoto = getThemePackPhotos(p.id, 1)?.[0]?.image;
        const fallbackThumb = Array.isArray(p.thumbs) ? p.thumbs[0] : '';
        return {
          kind: 'pack',
          id: existing?.id ?? `seed:${p.id}`,
          seedPackId: p.id,
          name: p.title ?? 'Pack',
          photoIds,
          thumb: headPhoto ?? fallbackThumb ?? '',
          activated: activatedSeeds.has(p.id),
        } as PickRow;
      });

    return [...userRows, ...packRows];
  }, [collections]);

  const onPick = useCallback(
    async (row: PickRow) => {
      // Tap behaviour changed (user feedback): the previous version
      // silently swapped the active mood pool and popped back, which
      // left the user with "I can't see the images in the gallery."
      // Now tap → open the pool detail screen (`/mood/pool/[id]`) so
      // the user can browse photos and explicitly activate it via the
      // CTA at the top of that screen.
      //
      // Pack rows are materialized first via `ensureBuiltinPackCollection`
      // (NOT `activateBuiltinPack` — see the comment on the selector
      // declaration above) so the pool screen gets a stable Collection
      // id to query. The shuffle active pointer stays untouched.
      let collectionId = row.id;
      if (row.kind === 'pack' && !row.activated) {
        collectionId = ensureBuiltinPackCollection(
          row.seedPackId!,
          row.name,
          row.photoIds,
        );
      }
      router.push(`/mood/pool/${collectionId}` as Href);
    },
    [ensureBuiltinPackCollection, router],
  );

  /**
   * Create a fresh empty user collection, wire it as the mood pool, and jump
   * to the new lightweight pool detail screen (`/mood/pool/[id]`) where
   * the user fills photo slots via the in-screen "Add photos" CTA. The
   * collection is set as the active mood pool BEFORE editing so even if
   * the user backs out without adding photos, the next return to Mood
   * Home shows the (empty) new pool — easier to discover and finish than
   * navigating back through the picker.
   *
   * Replaced the previous `/shuffle/[id]` destination (the heavy
   * collection editor wired for the shuffle hub). User feedback:
   * "for create gallery do completely like what we did in @app/theme-pack/".
   * The new `/mood/pool/[id]` screen mirrors the theme-pack layout —
   * clean header, top CTA, photo grid — plus an add-photos action bar.
   */
  const onCreate = useCallback(() => {
    const doCreate = async () => {
      const c = createCollection('My mood pool', 'mood');
      await setMoodCollection(c.id);
      router.push(`/mood/pool/${c.id}` as Href);
    };
    // Free tier may build ONE custom MOOD pool (Shuffle hub has its own
    // independent slot). Built-in packs don't count against the cap.
    if (!canAddCollection(isPremium, 'mood')) {
      premiumAlert({
        title: 'Free tier limit reached',
        message:
          'Free accounts can build one mood pool at a time. Upgrade to Premium for unlimited pools, or delete an existing one.',
        icon: 'diamond',
        accentColor: Colors.gold,
        buttons: [
          { text: 'Not now', style: 'cancel' },
          { text: 'Upgrade', onPress: () => gatePremium(doCreate) },
        ],
      });
      return;
    }
    doCreate();
  }, [
    canAddCollection,
    isPremium,
    createCollection,
    setMoodCollection,
    router,
  ]);

  const renderItem = useCallback<ListRenderItem<PickRow>>(
    ({ item }) => (
      <CollectionRow
        row={item}
        selected={item.id === activeCollectionId}
        onPick={() => onPick(item)}
      />
    ),
    [activeCollectionId, onPick],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Pick a pool</Text>
          <Text style={styles.subtitle}>
            Mood Mode will pull wallpapers from this collection
          </Text>
        </View>
      </View>

      <FlatList
        data={allRows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={{ marginBottom: Spacing.sm }}>
            <AnimatedButton
              onPress={onCreate}
              style={[styles.createRow, { borderColor: theme.primary }]}
            >
              <View
                style={[
                  styles.createIcon,
                  { borderColor: theme.primary, backgroundColor: 'rgba(250,179,202,0.10)' },
                ]}
              >
                <Ionicons name="add" size={26} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.createTitle, { color: theme.text }]}>
                  Create your own pool
                </Text>
                <Text style={styles.createCaption}>
                  Pick 10 photos — from the app, your gallery, or any image URL
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
            </AnimatedButton>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No packs yet — tap “Create your own pool” above to start.
          </Text>
        }
      />
    </SafeAreaView>
  );
}

type PickRow =
  | {
      kind: 'collection';
      id: string;
      name: string;
      photoIds: string[];
      thumb: string;
    }
  | {
      kind: 'pack';
      id: string;
      seedPackId: string;
      name: string;
      photoIds: string[];
      thumb: string;
      activated: boolean;
    };

function photoThumb(photoIds: string[]): string {
  const first = photoIds[0];
  if (!first) return '';
  return getPhotoById(first)?.image ?? '';
}

function CollectionRow({
  row,
  selected,
  onPick,
}: {
  row: PickRow;
  selected: boolean;
  onPick: () => void;
}) {
  const theme = useTheme();
  // Defensive: a malformed row with no photoIds array used to throw here.
  const tally = useMemo(
    () => tallyMoodBuckets(Array.isArray(row.photoIds) ? row.photoIds : []),
    [row.photoIds],
  );
  const photoCount = Array.isArray(row.photoIds) ? row.photoIds.length : 0;

  return (
    <AnimatedButton
      onPress={onPick}
      style={[
        styles.row,
        selected && { borderColor: theme.primary, shadowColor: theme.primary },
      ]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: row.thumb }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={80}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={styles.thumbFade}
          pointerEvents="none"
        />
        <View style={[styles.kindPill, { backgroundColor: theme.primary }]}>
          <Text style={styles.kindPillText}>
            {row.kind === 'pack' ? 'PACK' : 'YOURS'}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.meta}>
          {photoCount} photos · {selected ? 'Active for mood mode' : 'Tap to pick'}
        </Text>
        <View style={styles.tallyRow}>
          {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
            const m = MOOD_BY_ID[mid];
            const c = tally[mid];
            return (
              <View key={mid} style={styles.tallyCell}>
                <Text style={[styles.tallyEmoji, c === 0 && { opacity: 0.3 }]}>
                  {m.emoji}
                </Text>
                <Text
                  style={[
                    styles.tallyCount,
                    { color: c > 0 ? m.tint : Colors.textMute },
                  ]}
                >
                  {c}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
      )}
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
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 140 },
  empty: {
    color: Colors.textDim,
    textAlign: 'center',
    marginTop: 60,
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  thumbWrap: {
    width: 64,
    height: 80,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  thumbFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '60%',
  },
  kindPill: {
    position: 'absolute',
    top: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  kindPillText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#131313',
    letterSpacing: 0.5,
  },
  body: { flex: 1, gap: 4 },
  name: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  meta: { color: Colors.textDim, fontSize: 11, fontWeight: '700' },
  tallyRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  tallyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tallyEmoji: { fontSize: 11 },
  tallyCount: { fontSize: 10, fontWeight: '800' },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  createIcon: {
    width: 64,
    height: 80,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTitle: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  createCaption: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 12,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  errorMsg: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  errorBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
});
