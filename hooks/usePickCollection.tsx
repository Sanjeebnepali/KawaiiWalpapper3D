import { type Href, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { type ListRenderItem } from 'react-native';
import { getThemePackPhotos, moodAlbums } from '../constants/mockData';
import { Colors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { hydrateMoodStore, useMoodStore } from '../store/mood';
import { useCollections, useShuffleStore } from '../store/shuffle';
import { useSettingsStore } from '../store/settings';
import { gatePremium } from '../components/PremiumLock';
import { premiumAlert } from '../components/PremiumAlert';
import { CollectionRow } from '../components/moodPickCollection/CollectionRow';
import { photoThumb } from '../components/moodPickCollection/photoThumb';
import { type PickRow } from '../components/moodPickCollection/pickRow.types';

/**
 * Hook-extracted logic for the Mood Mode collection picker screen
 * (`app/mood/pick-collection.tsx`). Holds every hook call, handler closure,
 * and derived value the screen's JSX consumes. Behaviour is identical to the
 * inlined version — hooks run in the same order and every dependency array is
 * preserved verbatim.
 */
export function usePickCollection() {
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

  return {
    theme,
    allRows,
    onCreate,
    renderItem,
    router,
  };
}
