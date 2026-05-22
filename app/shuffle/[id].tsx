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
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { PremiumSheet } from '../../components/PremiumSheet';
import { gatePremium, PremiumLock } from '../../components/PremiumLock';
import { getPhotoById, searchCatalog } from '../../constants/mockData';
import {
  COLLECTION_SIZE,
  SHUFFLE_MODES,
  TIMER_OPTIONS,
} from '../../constants/shuffle';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { pickGalleryImage } from '../../lib/galleryPicker';
import { applyCollectionPhoto } from '../../lib/shuffleActions';
import { toast } from '../../lib/toast';
import { otherActiveDriverLabels } from '../../lib/automationMode';
import { downloadInternetImage } from '../../lib/wallpaperActions';
import { useSettingsStore } from '../../store/settings';
import {
  useActiveCollectionId,
  useCollectionById,
  useShuffleStore,
} from '../../store/shuffle';

const PICKER_COLS = 3;
const PICKER_GAP = 8;
// Wallpaper aspect — taller cells look like portrait phone screens, much
// more premium than the old 1:1 squares.
const PICKER_ASPECT = 9 / 16;

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
  const isPremium = useSettingsStore((s) => s.isPremium);

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
      premium ? gatePremium(apply) : apply();
    },
    [collection.id, updateCollection],
  );

  const pickMode = useCallback(
    (mode: string, premium: boolean) => {
      const apply = () =>
        updateCollection(collection.id, {
          mode: mode as typeof collection.mode,
        });
      premium ? gatePremium(apply) : apply();
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
    // Mutual exclusivity surfacing — activating a shuffle (the Theme
    // driver) stops every other continuous driver (Mood-based + Friend
    // check-in) via the bootstrap subscriber → `enforceSingleDriver`.
    // Capture what's running BEFORE setActive so we can name what got
    // paused.
    const pausedOthers = otherActiveDriverLabels('theme');
    setActive(collection.id);
    if (pausedOthers.length) {
      toast(`▶ Shuffle on · ${pausedOthers.join(' + ')} paused`);
    }
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

        {/* Photo picker — premium portrait-aspect grid */}
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
                {m.premium && !isPremium ? <PremiumLock /> : null}
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
                    {t.premium && !isPremium ? <PremiumLock /> : null}
                    {selected ? (
                      <Ionicons name="checkmark-circle" size={18} color={theme.primary} />
                    ) : null}
                  </AnimatedButton>
                );
              })}

              {collection.timerId === 'custom' && isPremium ? (
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
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
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 140,
    gap: Spacing.lg,
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  cardLabel: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  helperText: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
  input: {
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
    color: Colors.text,
  },
  numberInput: {
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHi,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: PICKER_GAP,
    paddingTop: Spacing.xs,
  },
  sourceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  sourceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1.5,
  },
  sourceBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  sourceHint: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
  },
  urlSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  urlSaveBtnText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  urlFootnote: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  cell: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellImg: { width: '100%', height: '100%' },
  cellSelectedFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,179,202,0.18)',
  },
  selectBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  selectBadgeText: {
    color: '#131313',
    fontSize: 12,
    fontWeight: '900',
  },
  unselectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  countChipText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  clearBtnText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textDecorationLine: 'underline',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionLabel: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  optionCaption: { color: Colors.textDim, fontSize: 11, fontWeight: '600', marginTop: 1 },
  customRow: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    gap: 6,
  },
  dayNoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceHi,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  dayNoteText: {
    flex: 1,
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  primaryBtnText: {
    color: '#131313',
    fontSize: 14,
    fontWeight: '800',
  },
});
