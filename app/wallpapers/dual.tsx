import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { premiumAlert } from '../../components/PremiumAlert';
import { AnimatedButton } from '../../components/AnimatedButton';
import { SimpleButton } from '../../components/SimpleButton';
import { dualWallpapers, type DualPair } from '../../constants/mockData';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useDeferredMount } from '../../hooks/useDeferredMount';
import { toast } from '../../lib/toast';
import {
  setAsWallpaper,
  shareWallpaper,
  type WallpaperTarget,
} from '../../lib/wallpaperActions';

const COLS = 2;
const GAP = 8;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (d: DualPair) => d.id;

export default function DualWallpapersScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const imgH = Math.round(cardW * 1.1);

  const [applyingId, setApplyingId] = useState<string | null>(null);
  // Defer grid mount until the stack push animation completes — see
  // hooks/useDeferredMount for the rationale. Without this, the screen
  // shell paints late and the push slide-in stutters.
  const listReady = useDeferredMount();

  /**
   * Apply the wallpaper via the shared helper in `lib/wallpaperActions`.
   * On Android this opens the native "Set as wallpaper" picker on the
   * specific image (see changes/014); on iOS the user finishes from
   * Photos. The `applyingId` overlay is purely cosmetic feedback while
   * the image downloads — the system picker takes over once it appears.
   */
  const setWallpaper = useCallback(
    async (imageUri: string, target: WallpaperTarget, item: typeof dualWallpapers[0]) => {
      setApplyingId(item.title);
      const r = await setAsWallpaper(imageUri, item.id, target);
      toast(r.message);
      setApplyingId(null);
    },
    [],
  );

  const handleSelectWallpaper = useCallback((item: typeof dualWallpapers[0]) => {
    premiumAlert({
      title: 'Set Wallpaper',
      message: `Where would you like to apply "${item.title}"?`,
      icon: 'image-outline',
      buttons: [
        {
          text: 'Lock Screen',
          onPress: () => setWallpaper(item.lockImage, 'lock', item),
        },
        {
          text: 'Home Screen',
          onPress: () => setWallpaper(item.homeImage, 'home', item),
        },
        {
          text: 'Both Screens',
          // The card displays the lock-screen image, so reuse it for "both".
          onPress: () => setWallpaper(item.lockImage, 'both', item),
        },
        {
          text: 'Share',
          onPress: async () => {
            const r = await shareWallpaper(item.lockImage, item.id);
            if (r.message) toast(r.message);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [setWallpaper]);

  const renderItem: ListRenderItem<DualPair> = useCallback(
    ({ item }) => {
      const isApplying = applyingId === item.title;
      return (
        <SimpleButton
          onPress={() => handleSelectWallpaper(item)}
          disabled={isApplying}
          style={[
            styles.card,
            { width: cardW },
            isApplying && styles.applying,
          ]}
        >
          <View style={[styles.imageWrap, { height: imgH }]}>
            <Image
              source={{ uri: item.lockImage }}
              style={styles.image}
              contentFit="cover"
              transition={0}
              cachePolicy="memory-disk"
              recyclingKey={item.id}
            />

            {isApplying && (
              <View style={styles.applyingOverlay}>
                <View style={styles.spinner} />
                <Text style={styles.applyingText}>Applying...</Text>
              </View>
            )}
          </View>

          <View style={styles.cardFoot}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.cardSub}>Tap to set as lock + home</Text>
          </View>
        </SimpleButton>
      );
    },
    [applyingId, cardW, imgH, handleSelectWallpaper],
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
          style={styles.backBtn}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          Dual Wallpapers
        </Text>
        <View style={styles.dot} />
      </View>

      {listReady ? (
        <FlatList
          data={dualWallpapers}
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
          extraData={applyingId}
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
    flex: 1,
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gold,
    shadowColor: Colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  imageWrap: {
    position: 'relative',
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  cardFoot: { padding: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  cardSub: { color: Colors.textDim, fontSize: 11, fontWeight: '600', marginTop: 1 },
  applying: { opacity: 0.6 },
  applyingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: Colors.pink,
  },
  applyingText: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
