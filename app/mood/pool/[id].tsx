import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../../components/AnimatedButton';
import { premiumAlert } from '../../../components/PremiumAlert';
import { SimpleButton } from '../../../components/SimpleButton';
import { COLLECTION_SIZE } from '../../../constants/shuffle';
import { getPhotoById } from '../../../constants/mockData';
import { Colors, Radius, Spacing } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useDeferredMount } from '../../../hooks/useDeferredMount';
import { pickGalleryImages } from '../../../lib/galleryPicker';
import { toast } from '../../../lib/toast';
import {
  downloadInternetImage,
  setAsWallpaper,
} from '../../../lib/wallpaperActions';
import { useMoodStore } from '../../../store/mood';
import {
  useActiveCollectionId,
  useCollectionById,
  useShuffleStore,
} from '../../../store/shuffle';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;

/**
 * Mood pool detail — view + lightweight edit.
 *
 * Patterned on `app/theme-pack/[id].tsx`: clean header, top CTA, 2-col
 * photo grid. Adapted for mood pools where photoIds can be either
 * catalog refs (resolved via `getPhotoById`) OR direct `file://` /
 * `content://` URIs from the gallery picker. Renders both uniformly.
 *
 * Two entry points:
 *   1. Pool picker (`app/mood/pick-collection.tsx`) row tap — open an
 *      existing pool to browse its photos. Replaces the old behaviour
 *      where tapping a row silently swapped the active mood pool and
 *      popped back; user reported "I click it select but how can I
 *      see the images in the gallery."
 *   2. Pool picker → "Create your own pool" — creates an empty
 *      collection and routes here so the user lands in the same view
 *      they'll use to manage it long-term, rather than the much
 *      heavier `app/shuffle/[id]` editor (which is wired for the
 *      shuffle hub, not the mood feature).
 */
export default function MoodPoolDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  // Bottom-inset for the "Add photos" floating bar — without this the
  // button sits flush against the OS gesture / 3-button nav and is
  // partially clipped on most Vivo / MIUI devices. Top edge is owned
  // by SafeAreaView's `edges={['top']}` below, but the absolutely-
  // positioned footer doesn't inherit safe-area, so we read the inset
  // here and add it to the footer's paddingBottom inline.
  const insets = useSafeAreaInsets();

  const collection = useCollectionById(id ?? '');
  const activeShuffleId = useActiveCollectionId();
  const moodCollectionId = useMoodStore((s) => s.moodCollectionId);
  const setMoodCollection = useMoodStore((s) => s.setMoodCollection);
  const backgroundEnabled = useMoodStore((s) => s.backgroundEnabled);
  const setBackgroundEnabled = useMoodStore((s) => s.setBackgroundEnabled);
  const updateCollection = useShuffleStore((s) => s.updateCollection);
  const deleteCollection = useShuffleStore((s) => s.deleteCollection);

  const isUserPool = !collection?.seedPackId;
  const isActiveMood = moodCollectionId === collection?.id;
  const remaining = useMemo(
    () => COLLECTION_SIZE - (collection?.photoIds.length ?? 0),
    [collection?.photoIds.length],
  );

  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.4);
  const listReady = useDeferredMount();

  // Resolve a photoId-or-uri into a renderable image URL. Catalog IDs
  // pass through getPhotoById; direct URIs (gallery / downloaded) return
  // unchanged so they render via expo-image directly.
  const resolveImage = useCallback((ref: string): string | null => {
    if (!ref) return null;
    if (ref.startsWith('file://') || ref.startsWith('content://')) {
      return ref;
    }
    return getPhotoById(ref)?.image ?? null;
  }, []);

  // ─── CTA: use this pool / active ────────────────────────────────────────
  const onUseAsMood = useCallback(() => {
    if (!collection) return;
    if (collection.photoIds.length === 0) {
      toast('Add at least one photo before using this pool');
      return;
    }
    void setMoodCollection(collection.id);
    toast(`✓ Mood pool: ${collection.name}`);
  }, [collection, setMoodCollection]);

  // ─── Add photos (user pools only) ───────────────────────────────────────
  const onAddFromGallery = useCallback(async () => {
    if (!collection) return;
    try {
      const limit = Math.max(1, remaining || COLLECTION_SIZE);
      const r = await pickGalleryImages({ limit });
      if (!r.ok || r.uris.length === 0) {
        if (r.reason === 'denied') toast('Gallery permission denied');
        else if (r.reason === 'module_missing')
          toast('Gallery picker unavailable in this build');
        else if (r.reason !== 'cancelled')
          toast('Could not pick from gallery — try one photo at a time');
        return;
      }
      // Append + dedupe; sliding window eviction at COLLECTION_SIZE so the
      // newest picks always win without forcing manual cleanup.
      const dedup = Array.from(new Set(r.uris));
      const without = collection.photoIds.filter((p) => !dedup.includes(p));
      const merged = [...without, ...dedup].slice(-COLLECTION_SIZE);
      updateCollection(collection.id, { photoIds: merged });
      toast(`✓ Added ${dedup.length} photo${dedup.length === 1 ? '' : 's'}`);
      // Instant-apply the first picked photo so the user sees their
      // pick land immediately (matches the mood.tsx Custom flow).
      const firstUri = r.uris[0];
      if (firstUri) {
        try {
          await setAsWallpaper(firstUri, `mood-pool-${Date.now()}`, 'both');
        } catch (applyErr) {
          if (__DEV__) console.warn('[mood/pool] gallery apply failed:', applyErr);
        }
      }
    } catch (e) {
      if (__DEV__) console.warn('[mood/pool] gallery flow crashed:', e);
      toast('Gallery pick failed — please retry');
    }
  }, [collection, remaining, updateCollection]);

  const onAddFromUrl = useCallback(() => {
    if (!collection) return;
    premiumAlert({
      title: 'Add from internet',
      message: 'Bottom-sheet URL paste lives in the main Mood tab → Custom → From Internet for now. Tap there to add URLs to this pool.',
      icon: 'globe-outline',
      buttons: [{ text: 'OK', style: 'cancel' }],
    });
  }, [collection]);

  const onAddFromUrlDirect = useCallback(
    async (url: string) => {
      if (!collection || !url) return;
      try {
        const r = await downloadInternetImage(url);
        if (!r.ok || !r.uri) {
          toast(r.reason === 'invalid_url' ? 'Not a valid http(s) URL' : 'Download failed');
          return;
        }
        const merged = [...collection.photoIds.filter((p) => p !== r.uri), r.uri].slice(
          -COLLECTION_SIZE,
        );
        updateCollection(collection.id, { photoIds: merged });
        toast('✓ Added 1 photo');
      } catch (e) {
        if (__DEV__) console.warn('[mood/pool] url flow crashed:', e);
        toast('URL download failed');
      }
    },
    [collection, updateCollection],
  );

  const onAddPress = useCallback(() => {
    if (!collection) return;
    if (remaining <= 0) {
      toast('Pool is full — long-press a photo to remove it first');
      return;
    }
    premiumAlert({
      title: 'Add photos',
      message: `${remaining} of ${COLLECTION_SIZE} slot${remaining === 1 ? '' : 's'} free.`,
      icon: 'add-circle-outline',
      buttons: [
        { text: 'From Gallery', onPress: onAddFromGallery },
        { text: 'From Internet', onPress: onAddFromUrl },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [collection, remaining, onAddFromGallery, onAddFromUrl]);

  // ─── Long-press to remove (user pools only) ────────────────────────────
  const onRemovePhoto = useCallback(
    (photoRef: string) => {
      if (!collection || !isUserPool) return;
      premiumAlert({
        title: 'Remove from pool?',
        message: 'The photo stays in your gallery — only the link to this pool is removed.',
        icon: 'trash-outline',
        buttons: [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            onPress: () => {
              const next = collection.photoIds.filter((p) => p !== photoRef);
              updateCollection(collection.id, { photoIds: next });
              toast('Photo removed');
            },
          },
        ],
      });
    },
    [collection, isUserPool, updateCollection],
  );

  const onDeletePool = useCallback(() => {
    if (!collection) return;
    premiumAlert({
      title: `Delete "${collection.name}"?`,
      message: isActiveMood
        ? 'This pool is currently used for Mood Mode. Deleting will pause Mood Mode until you pick another pool.'
        : 'The photos stay in your gallery. This only removes the pool.',
      icon: 'trash-outline',
      accentColor: Colors.error,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            deleteCollection(collection.id);
            // Clearing the mood pointer is the store's job too — call it
            // explicitly here in case the pool happened to be the active
            // mood pool (deleteCollection doesn't reach into the mood store).
            if (isActiveMood) {
              void setMoodCollection(null);
              // Also turn the background engine OFF when we just deleted the
              // pool it was rotating. Leaving backgroundEnabled true would
              // keep the foreground service (battery + ongoing notification)
              // running while every tick no-ops on the now-null collection.
              // The mood-store subscriber in moodBootstrap reacts to this
              // flag flip by stopping the context-mood FGS + unregistering
              // the OS bg task. Audit MOOD-8.
              if (backgroundEnabled) {
                void setBackgroundEnabled(false);
              }
            }
            toast('Pool deleted');
            router.back();
          },
        },
      ],
    });
  }, [
    collection,
    isActiveMood,
    backgroundEnabled,
    deleteCollection,
    setMoodCollection,
    setBackgroundEnabled,
    router,
  ]);

  // ─── Render ─────────────────────────────────────────────────────────────
  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item }) => {
      const uri = resolveImage(item);
      if (!uri) return null;
      return (
        <SimpleButton
          onPress={() => {
            // Catalog IDs route to the wallpaper preview screen; direct
            // URIs don't have a catalog entry so we set them as wallpaper
            // directly with a confirm toast (cheapest preview path).
            if (item.startsWith('file://') || item.startsWith('content://')) {
              void setAsWallpaper(item, `mood-pool-${item}`, 'both').then(
                (r) => toast(r.ok ? '✓ Applied as wallpaper' : r.message),
              );
            } else {
              router.push(`/wallpaper/${item}` as Href);
            }
          }}
          onLongPress={isUserPool ? () => onRemovePhoto(item) : undefined}
          style={[styles.cell, { width: cellW, height: cellH }]}
        >
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={80}
            cachePolicy="memory-disk"
          />
        </SimpleButton>
      );
    },
    [cellW, cellH, isUserPool, onRemovePhoto, resolveImage, router],
  );

  if (!collection) {
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
          <Text style={[styles.title, { color: theme.text }]}>Pool not found</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            This pool may have been deleted. Go back and pick another one.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        {isUserPool ? (
          <AnimatedButton
            onPress={onDeletePool}
            style={styles.backBtn}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </AnimatedButton>
        ) : (
          <View style={styles.headerPlaceholder} />
        )}
      </View>

      {/* CTA — use as mood pool / active indicator. */}
      <View style={styles.ctaRow}>
        <AnimatedButton
          onPress={onUseAsMood}
          style={[
            styles.ctaPrimary,
            isActiveMood
              ? { backgroundColor: Colors.surface, borderColor: theme.primary, borderWidth: 1.5 }
              : { backgroundColor: theme.primary },
          ]}
        >
          <Ionicons
            name={isActiveMood ? 'checkmark-circle' : 'sparkles-outline'}
            size={18}
            color={isActiveMood ? theme.primary : '#131313'}
          />
          <Text
            style={[
              styles.ctaPrimaryText,
              { color: isActiveMood ? theme.primary : '#131313' },
            ]}
          >
            {isActiveMood
              ? 'Active for Mood Mode'
              : 'Use this pool for Mood Mode'}
          </Text>
        </AnimatedButton>
      </View>

      {/* Photo grid OR empty state. */}
      {listReady ? (
        collection.photoIds.length > 0 ? (
          <FlatList
            data={collection.photoIds}
            keyExtractor={(p) => p}
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
            ListHeaderComponent={
              isUserPool ? (
                <Text style={styles.meta}>
                  {collection.photoIds.length} of {COLLECTION_SIZE} photos · long-press to remove
                </Text>
              ) : (
                <Text style={styles.meta}>
                  {collection.photoIds.length} photos · curated pack
                </Text>
              )
            }
          />
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="images-outline" size={40} color={Colors.textDim} />
            <Text style={styles.emptyTitle}>No photos yet</Text>
            <Text style={styles.emptyText}>
              Tap the button below to pick from your gallery or paste an image URL.
            </Text>
          </View>
        )
      ) : null}

      {/* Bottom action bar — user pools only. Curated packs can't be edited.
       *   paddingBottom inline = the safe-area inset bottom (gesture bar /
       *   3-button nav height) + a Spacing.md visual breathing margin, so
       *   the button never gets clipped by the OS nav and always has a
       *   consistent gap above the system UI. */}
      {isUserPool ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <AnimatedButton
            onPress={onAddPress}
            style={[styles.addBtn, { borderColor: theme.primary }]}
          >
            <Ionicons name="add" size={18} color={theme.primary} />
            <Text style={[styles.addBtnText, { color: theme.primary }]}>
              Add photos
            </Text>
          </AnimatedButton>
        </View>
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
  headerPlaceholder: { width: 40, height: 40 },
  title: {
    flex: 1,
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
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  list: {
    paddingHorizontal: SIDE,
    paddingBottom: 140,
  },
  meta: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingBottom: Spacing.sm,
  },
  cell: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  emptyText: {
    color: Colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    // paddingBottom is set inline above via `insets.bottom + Spacing.md`
    // so the button clears the OS gesture / 3-button nav on Vivo / MIUI.
    backgroundColor: 'rgba(19,19,19,0.92)',
    borderTopColor: Colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
