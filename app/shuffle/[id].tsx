import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { PremiumSheet } from '../../components/PremiumSheet';
import { gateFeature, PremiumLock } from '../../components/PremiumLock';
import { getPhotoById, searchCatalog } from '../../constants/mockData';
import {
  COLLECTION_SIZE,
  SHUFFLE_MODES,
  TIMER_OPTIONS,
} from '../../constants/shuffle';
import { Colors, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { pickGalleryImage } from '../../lib/galleryPicker';
import { applyCollectionPhoto } from '../../lib/shuffleActions';
import { toast } from '../../lib/toast';
import { confirmDriverSwitch } from '../../lib/confirmDriverSwitch';
import { downloadInternetImage } from '../../lib/wallpaperActions';
import { useEntitlement } from '../../lib/billing';
import {
  useActiveCollectionId,
  useCollectionById,
  useShuffleStore,
} from '../../store/shuffle';
import {
  PICKER_ASPECT,
  PICKER_COLS,
  PICKER_GAP,
} from '../../components/shuffleDetail/constants';
import { styles } from '../../components/shuffleDetail/styles';

/**
 * Collection detail — edit name, pick 10 images, choose shuffle mode + timer,
 * activate or pause. The image picker pulls from the unified `searchCatalog`
 * (the same source the in-app search uses).
 */
export default function CollectionDetail() {
  // `fromMood` is set by the Mood pool picker's Create flow so we know to
  // pop straight back to Mood Home (not into the shuffle-active screen)
  // once the user activates the collection — the user came here to build
  // a mood pool, not to start a stand-alone shuffle.
  const { id, fromMood } = useLocalSearchParams<{
    id: string;
    fromMood?: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const collection = useCollectionById(id);
  const activeId = useActiveCollectionId();
  const hasThemePacks = useEntitlement('themePacks');

  const updateCollection = useShuffleStore((s) => s.updateCollection);
  const setActive = useShuffleStore((s) => s.setActive);
  const deleteCollection = useShuffleStore((s) => s.deleteCollection);

  const [name, setName] = useState(collection?.name ?? '');
  const [customMinutes, setCustomMinutes] = useState(
    String(collection?.customMinutes ?? 60),
  );
  // URL-paste bottom-sheet for the "From internet" source. The sheet
  // accepts an http(s) URL, downloads via downloadInternetImage into
  // the app's cacheDirectory (NOT the device gallery), and pushes the
  // resulting file:// URI onto the collection's photoIds.
  const urlSheetRef = useRef<BottomSheetModal>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  const cellW = useMemo(
    () =>
      Math.floor(
        (width - Spacing.lg * 2 - Spacing.md * 2 - PICKER_GAP * (PICKER_COLS - 1)) / PICKER_COLS,
      ),
    [width],
  );
  const cellH = Math.round(cellW / PICKER_ASPECT);

  // Empty / not-found state — collection may have been deleted while
  // navigated. Bail to the list.
  if (!collection) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.notFound}>
          <Text style={[styles.title, { color: theme.text }]}>Collection not found</Text>
          <AnimatedButton
            onPress={() => router.back()}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.primaryBtnText}>Back</Text>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  }

  const selectedIds = collection.photoIds;
  const isFull = selectedIds.length >= COLLECTION_SIZE;
  const isActive = collection.id === activeId;
  // Built-in/curated packs carry a `seedPackId`; user-created collections
  // don't. Curated packs are developer-owned content: the photos are fixed
  // and must NOT be swappable by the user (only the timer + mode are). The
  // photo picker below is therefore replaced by a read-only grid for packs.
  // Photo-choosing lives only in "Create your own collection" (no seedPackId).
  const isBuiltinPack = !!collection.seedPackId;
  // Resolve the pack's fixed photos for the read-only grid. getPhotoById
  // returns the catalog image, or the URI itself for URI-style ids.
  const builtinPhotos = isBuiltinPack
    ? selectedIds
        .map((pid) => ({ id: pid, image: getPhotoById(pid)?.image ?? '' }))
        .filter((c) => c.image)
    : [];

  // Built-in pack photos (ids like `pink-lolita-0`) live in the theme-pack
  // generators, not in `searchCatalog`. Without surfacing them, the picker
  // shows 10/10 selected with no visible cells to deselect — the user
  // perceives the collection as "static" (changes/025). Prepend any
  // selected photo that's missing from the catalog so it's visible AND
  // tappable for removal.
  const pickerSource = useMemo(() => {
    const catalogIds = new Set(searchCatalog.map((p) => p.id));
    type Cell = { id: string; image: string };
    const extras: Cell[] = [];
    for (const id of selectedIds) {
      if (catalogIds.has(id)) continue;
      const p = getPhotoById(id);
      if (p) extras.push({ id, image: p.image });
    }
    return [
      ...extras,
      ...searchCatalog.map((p) => ({ id: p.id, image: p.image })),
    ];
  }, [selectedIds]);

  const togglePhoto = (pid: string) => {
    const already = selectedIds.includes(pid);
    if (already) {
      updateCollection(collection.id, {
        photoIds: selectedIds.filter((x) => x !== pid),
      });
    } else if (!isFull) {
      updateCollection(collection.id, {
        photoIds: [...selectedIds, pid],
      });
    } else {
      premiumAlert({
        title: 'Collection full',
        message: `A collection holds exactly ${COLLECTION_SIZE} photos. Remove one first.`,
        icon: 'albums-outline',
      });
    }
  };

  /**
   * Push a URI directly onto the collection's photoIds. Used by both the
   * Gallery picker and the Internet downloader — the photoId IS the URI
   * (file:// from gallery / file:// from cacheDirectory after download).
   * `getPhotoById` handles URI-style ids by returning the URI as the image
   * source, so the engine + picker grid render these cells correctly.
   */
  const addUriPhoto = useCallback(
    (uri: string) => {
      if (selectedIds.includes(uri)) {
        toast('Already in this collection');
        return;
      }
      if (selectedIds.length >= COLLECTION_SIZE) {
        premiumAlert({
          title: 'Collection full',
          message: `A collection holds exactly ${COLLECTION_SIZE} photos. Remove one first.`,
          icon: 'albums-outline',
        });
        return;
      }
      updateCollection(collection.id, {
        photoIds: [...selectedIds, uri],
      });
    },
    [collection.id, selectedIds, updateCollection],
  );

  const onPickFromGallery = useCallback(async () => {
    const r = await pickGalleryImage();
    if (!r.ok) {
      if (r.reason === 'cancelled') return;
      if (r.reason === 'module_missing') {
        premiumAlert({
          title: 'Needs a native rebuild',
          message:
            'expo-image-picker isn’t linked yet. Run `npx expo run:android` and reopen.',
          icon: 'construct-outline',
        });
        return;
      }
      if (r.reason === 'denied') {
        premiumAlert({
          title: 'Gallery access needed',
          message:
            'Allow photo-library access to add photos from your gallery.',
          icon: 'lock-closed',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      toast('Couldn’t open gallery');
      return;
    }
    addUriPhoto(r.uri!);
    toast('✓ Added from gallery');
  }, [addUriPhoto]);

  const openUrlSheet = useCallback(() => {
    setUrlInput('');
    urlSheetRef.current?.present();
  }, []);

  const onSaveUrl = useCallback(async () => {
    if (urlBusy) return;
    setUrlBusy(true);
    try {
      const r = await downloadInternetImage(urlInput);
      if (!r.ok) {
        if (r.reason === 'invalid_url') {
          toast('Enter a valid http(s) URL');
        } else {
          toast('Download failed — check the URL');
        }
        return;
      }
      addUriPhoto(r.uri!);
      urlSheetRef.current?.dismiss();
      setTimeout(() => toast('✓ Added from internet'), 240);
    } finally {
      setUrlBusy(false);
    }
  }, [urlInput, urlBusy, addUriPhoto]);

  const onNameBlur = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== collection.name) {
      updateCollection(collection.id, { name: trimmed });
    } else {
      setName(collection.name);
    }
  };

  const pickTimer = useCallback(
    (timerId: string, premium: boolean) => {
      const apply = () => updateCollection(collection.id, { timerId });
      premium ? gateFeature('themePacks', apply) : apply();
    },
    [collection.id, updateCollection],
  );

  const pickMode = useCallback(
    (mode: string, premium: boolean) => {
      const apply = () =>
        updateCollection(collection.id, {
          mode: mode as typeof collection.mode,
        });
      premium ? gateFeature('themePacks', apply) : apply();
    },
    [collection.id, updateCollection],
  );

  const toggleActive = async () => {
    if (selectedIds.length === 0) {
      premiumAlert({
        title: 'Pick photos first',
        message: 'Add at least one photo before activating.',
        icon: 'images-outline',
      });
      return;
    }
    if (isActive) {
      setActive(null);
      return;
    }
    // Mutual exclusivity — activating a shuffle (the Theme driver) stops every
    // other continuous driver (Mood-based + Friend check-in) via the bootstrap
    // subscriber → `enforceSingleDriver`. Confirm BEFORE switching so the pause
    // is never silent (changes/189). `confirmDriverSwitch` runs `proceed`
    // immediately when nothing else is active (no dialog).
    confirmDriverSwitch({
      keep: 'theme',
      enablingLabel: 'Theme shuffle',
      onConfirm: () => void activateShuffle(),
    });
  };

  const activateShuffle = async () => {
    setActive(collection.id);
    // Instant apply so the user sees the wallpaper change immediately
    // (without this, nothing happens until the first timer tick — which
    // is up to 60+ minutes away on the default interval).
    //
    // Day-based is the exception: it rotates ONLY on the midnight boundary
    // (one new wallpaper per day). Activating at, say, 23:59 then doing an
    // instant image-0 apply would be immediately followed by the midnight
    // alarm advancing to image 1 a minute later — two changes inside a
    // minute, violating "one new wallpaper per day." Skip the instant apply
    // for Day mode and let the boundary alarm do the first rotation.
    if (collection.mode !== 'day') {
      const r = await applyCollectionPhoto(collection.id, selectedIds, 0);
      if (!r.ok) toast(r.message);
    }
    if (fromMood) {
      // Coming from the Mood pool "Create" flow — pop back to Mood Home
      // instead of routing into the stand-alone shuffle screen.
      router.back();
    } else {
      router.push('/shuffle/active');
    }
  };

  const onClearPhotos = () => {
    if (selectedIds.length === 0) return;
    premiumAlert({
      title: 'Clear selection',
      message: 'Remove all photos from this collection?',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => updateCollection(collection.id, { photoIds: [] }),
        },
      ],
    });
  };

  // Commit on every keystroke when the value parses inside the allowed
  // window (5 min – 24 h). Previously the input only persisted on blur,
  // and if the user typed a value then tapped "Start" Android could
  // process the tap before the blur fired — the typed value was lost
  // and the timer reverted to the previous customMinutes (changes/025).
  const onChangeCustomMinutes = (text: string) => {
    setCustomMinutes(text);
    const n = Number(text);
    if (Number.isFinite(n) && n >= 5 && n <= 24 * 60) {
      updateCollection(collection.id, { customMinutes: Math.round(n) });
    }
  };
  const onCommitCustomMinutes = () => {
    const n = Number(customMinutes);
    if (!Number.isFinite(n) || n < 5) {
      // Snap back to the last saved value if the user blurred with junk.
      setCustomMinutes(String(collection.customMinutes ?? 60));
      return;
    }
    updateCollection(collection.id, { customMinutes: Math.round(n) });
  };

  const onDelete = () => {
    // Capture id locally — the closure runs after the Alert dismisses, and
    // by the time the store mutates `collection` will be null on the next
    // render.
    const targetId = collection.id;
    premiumAlert({
      title: 'Delete collection',
      message: `Delete "${collection.name}"?`,
      icon: 'trash-outline',
      accentColor: '#FF7A6E',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Pop the screen FIRST so we don't render a "Collection not
            // found" frame between the store update and the back animation
            // (which was visible as a flash on Android). The deferred
            // delete then runs after navigation has started.
            router.back();
            setTimeout(() => {
              try {
                deleteCollection(targetId);
              } catch (e) {
                toast('Failed to delete collection');
                console.warn('[shuffle] delete failed:', e);
              }
            }, 0);
          },
        },
      ],
    });
  };

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
          Edit Collection
        </Text>
        <AnimatedButton
          onPress={onDelete}
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </AnimatedButton>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Name editor */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onBlur={onNameBlur}
            placeholder="Collection name"
            placeholderTextColor={Colors.textMute}
            style={[styles.input, { color: theme.text }]}
            maxLength={40}
            returnKeyType="done"
          />
        </View>

        {/* Photos — read-only for curated packs (developer-owned, fixed),
            editable picker for user collections. Photo-choosing is a
            "Create your own collection" feature only. */}
        {isBuiltinPack ? (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Photos</Text>
              <Text style={styles.helperText}>
                Curated pack — photos are fixed
              </Text>
            </View>
            <View
              style={[
                styles.countChip,
                {
                  borderColor: theme.primary,
                  backgroundColor: 'rgba(250,179,202,0.08)',
                },
              ]}
            >
              <Ionicons name="lock-closed" size={12} color={theme.primary} />
              <Text style={[styles.countChipText, { color: theme.primary }]}>
                {builtinPhotos.length}
              </Text>
            </View>
          </View>
          <View style={styles.grid}>
            {builtinPhotos.map((p) => (
              <View
                key={p.id}
                style={[styles.cell, { width: cellW, height: cellH }]}
              >
                <Image
                  source={{ uri: p.image }}
                  style={styles.cellImg}
                  contentFit="cover"
                  transition={80}
                  cachePolicy="memory-disk"
                />
              </View>
            ))}
          </View>
        </View>
        ) : (
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLabel}>Photos</Text>
              <Text style={styles.helperText}>
                Pick {COLLECTION_SIZE} wallpapers to build the rotation
              </Text>
            </View>
            <View
              style={[
                styles.countChip,
                {
                  borderColor: theme.primary,
                  backgroundColor: isFull
                    ? theme.primary
                    : 'rgba(250,179,202,0.08)',
                },
              ]}
            >
              <Ionicons
                name={isFull ? 'checkmark-circle' : 'images'}
                size={12}
                color={isFull ? '#131313' : theme.primary}
              />
              <Text
                style={[
                  styles.countChipText,
                  { color: isFull ? '#131313' : theme.primary },
                ]}
              >
                {selectedIds.length}/{COLLECTION_SIZE}
              </Text>
            </View>
            {selectedIds.length > 0 ? (
              <AnimatedButton onPress={onClearPhotos} hitSlop={6} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </AnimatedButton>
            ) : null}
          </View>

          {/* Photo source picker — three ways to fill the collection's 10
              slots. Tap a button → photo flows into photoIds via
              addUriPhoto (gallery/internet) or via togglePhoto (in-app
              catalog grid below). */}
          <View style={styles.sourceRow}>
            <AnimatedButton
              onPress={onPickFromGallery}
              style={[
                styles.sourceBtn,
                { borderColor: theme.primary, backgroundColor: 'rgba(250,179,202,0.08)' },
              ]}
            >
              <Ionicons name="images" size={16} color={theme.primary} />
              <Text style={[styles.sourceBtnText, { color: theme.primary }]}>
                Gallery
              </Text>
            </AnimatedButton>
            <AnimatedButton
              onPress={openUrlSheet}
              style={[
                styles.sourceBtn,
                { borderColor: Colors.cyan, backgroundColor: 'rgba(110,231,255,0.08)' },
              ]}
            >
              <Ionicons name="globe-outline" size={16} color={Colors.cyan} />
              <Text style={[styles.sourceBtnText, { color: Colors.cyan }]}>
                Internet
              </Text>
            </AnimatedButton>
          </View>
          <Text style={styles.sourceHint}>
            Or pick from the in-app library below.
          </Text>

          <View style={styles.grid}>
            {pickerSource.map((p) => {
              const idx = selectedIds.indexOf(p.id);
              const selected = idx >= 0;
              return (
                <AnimatedButton
                  key={p.id}
                  onPress={() => togglePhoto(p.id)}
                  style={[
                    styles.cell,
                    { width: cellW, height: cellH },
                    selected && {
                      borderColor: theme.primary,
                      borderWidth: 2,
                    },
                  ]}
                  scaleTo={0.94}
                >
                  <Image
                    source={{ uri: p.image }}
                    style={[
                      styles.cellImg,
                      // Dim unselected cells slightly once a selection exists,
                      // so the picks "pop" — a small premium touch.
                      !selected && selectedIds.length > 0 && { opacity: 0.55 },
                    ]}
                    contentFit="cover"
                    transition={80}
                    cachePolicy="memory-disk"
                  />
                  {selected ? (
                    <>
                      <View style={styles.cellSelectedFill} />
                      <View
                        style={[
                          styles.selectBadge,
                          { backgroundColor: theme.primary },
                        ]}
                      >
                        <Text style={styles.selectBadgeText}>{idx + 1}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.unselectedBadge}>
                      <Ionicons name="add" size={14} color="rgba(255,255,255,0.85)" />
                    </View>
                  )}
                </AnimatedButton>
              );
            })}
          </View>
        </View>
        )}

        {/* Shuffle mode */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Shuffle Mode</Text>
          {SHUFFLE_MODES.map((m) => {
            const selected = m.id === collection.mode;
            return (
              <AnimatedButton
                key={m.id}
                onPress={() => pickMode(m.id, m.premium)}
                style={[
                  styles.optionRow,
                  selected && { borderColor: theme.primary },
                ]}
              >
                <Ionicons
                  name={m.icon}
                  size={18}
                  color={selected ? theme.primary : Colors.textDim}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.optionLabel,
                      selected && { color: theme.primary },
                    ]}
                  >
                    {m.label}
                  </Text>
                  <Text style={styles.optionCaption}>{m.caption}</Text>
                </View>
                {m.premium && !hasThemePacks ? <PremiumLock /> : null}
                {selected ? (
                  <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                ) : null}
              </AnimatedButton>
            );
          })}
        </View>

        {/* Timer — hidden for Day-based, which rotates on the day boundary
            (midnight) regardless of any interval. Showing a timer here used
            to imply Day-based would change on that interval; it never did,
            which is why it looked frozen. */}
        <View style={styles.card}>
          {collection.mode === 'day' ? (
            <>
              <Text style={styles.cardLabel}>Schedule</Text>
              <View style={styles.dayNoteRow}>
                <Ionicons name="calendar" size={18} color={theme.primary} />
                <Text style={styles.dayNoteText}>
                  Day-based changes automatically once a day, at midnight — a
                  new wallpaper from this collection each day. No timer needed.
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.cardLabel}>Shuffle every</Text>
              {TIMER_OPTIONS.map((t) => {
                const selected = t.id === collection.timerId;
                return (
                  <AnimatedButton
                    key={t.id}
                    onPress={() => pickTimer(t.id, t.premium)}
                    style={[
                      styles.optionRow,
                      selected && { borderColor: theme.primary },
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={18}
                      color={selected ? theme.primary : Colors.textDim}
                    />
                    <Text
                      style={[
                        styles.optionLabel,
                        { flex: 1 },
                        selected && { color: theme.primary },
                      ]}
                    >
                      {t.id === 'custom' && collection.customMinutes
                        ? `Custom (${collection.customMinutes} min)`
                        : t.label}
                    </Text>
                    {t.premium && !hasThemePacks ? <PremiumLock /> : null}
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                    ) : null}
                  </AnimatedButton>
                );
              })}

              {collection.timerId === 'custom' && hasThemePacks ? (
                <View style={styles.customRow}>
                  <Text style={styles.cardLabel}>Custom (minutes)</Text>
                  <TextInput
                    value={customMinutes}
                    onChangeText={onChangeCustomMinutes}
                    onBlur={onCommitCustomMinutes}
                    keyboardType="number-pad"
                    placeholder="60"
                    placeholderTextColor={Colors.textMute}
                    style={[styles.input, styles.numberInput, { color: theme.text }]}
                    returnKeyType="done"
                  />
                </View>
              ) : null}
            </>
          )}
        </View>

        <AnimatedButton
          onPress={toggleActive}
          style={[
            styles.primaryBtn,
            isActive
              ? { backgroundColor: Colors.error }
              : { backgroundColor: theme.primary },
          ]}
        >
          <Ionicons
            name={isActive ? 'pause' : 'play'}
            size={18}
            color="#131313"
          />
          <Text style={styles.primaryBtnText}>
            {isActive ? 'Stop shuffle' : 'Start shuffle'}
          </Text>
        </AnimatedButton>
      </ScrollView>

      {/* URL-paste bottom-sheet — "From internet" source. Downloads the
          pasted image into the app's cacheDirectory only; never lands
          in the device gallery. */}
      <PremiumSheet
        ref={urlSheetRef}
        snapPoints={['52%']}
        title="Add from internet"
        subtitle="Paste an image URL — the photo downloads into the app only, not your gallery."
        accentColor={Colors.cyan}
      >
        <View style={{ gap: Spacing.md }}>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder="https://example.com/image.jpg"
            placeholderTextColor={Colors.textMute}
            style={[styles.urlInput, { color: theme.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={onSaveUrl}
          />
          <AnimatedButton
            onPress={onSaveUrl}
            style={[styles.urlSaveBtn, { backgroundColor: Colors.cyan }]}
            disabled={urlBusy}
          >
            {urlBusy ? (
              <ActivityIndicator color="#131313" />
            ) : (
              <>
                <Ionicons name="cloud-download-outline" size={18} color="#131313" />
                <Text style={styles.urlSaveBtnText}>Download &amp; add</Text>
              </>
            )}
          </AnimatedButton>
          <Text style={styles.urlFootnote}>
            The image is cached locally so wallpaper-set still works offline.
            It’s not added to your device gallery.
          </Text>
        </View>
      </PremiumSheet>
    </SafeAreaView>
  );
}
