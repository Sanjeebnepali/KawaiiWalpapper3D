import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import {
  FlatList,
  type ListRenderItem,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { CoupleCard } from '../../components/coupleTab/CoupleCard';
import { SIDE, styles } from '../../components/coupleTab/styles';
import { PremiumLock } from '../../components/PremiumLock';
import { coupleWallpapers, type CoupleWallpaper } from '../../constants/mockData';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStatus } from '../../store/auth';
import { useCoupleLink } from '../../store/couple';

const COLS = 2;
const GAP = 12;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (c: CoupleWallpaper) => c.id;

/**
 * Couple Tab — entry point for the Couple Proximity Wallpaper feature.
 *
 * The grid shows the real couple packs (together image only). Tapping a
 * card opens the preview where each partner chooses their solo half (boy /
 * girl) and continues to pairing.
 *
 * Routes based on link state:
 *   - anon         → "sign in" CTA
 *   - unlinked     → header card with CTA → /couple/setup
 *   - pending      → "waiting" card → /couple/linking
 *   - linked       → connected card → /couple/dashboard
 *
 * The pack grid stays visible in every state so a user who hasn't paired
 * yet can still browse the couple packs.
 */
export default function CoupleTab() {
  const router = useRouter();
  const theme = useTheme();
  const authStatus = useAuthStatus();
  const link = useCoupleLink();
  const { width } = useWindowDimensions();
  const cellW = Math.floor((width - SIDE * 2 - GAP * (COLS - 1)) / COLS);
  const cellH = Math.round(cellW * 1.5);

  const openPack = useCallback(
    (packId: string) => router.push(`/couple/preview?packId=${packId}` as Href),
    [router],
  );

  const renderItem = useCallback<ListRenderItem<CoupleWallpaper>>(
    ({ item }) => (
      <CoupleCard item={item} width={cellW} height={cellH} onOpen={openPack} />
    ),
    [cellW, cellH, openPack],
  );

  if (authStatus === 'anon') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.lockedWrap}>
          <View style={[styles.lockedGlyph, { backgroundColor: theme.primary }]}>
            <Ionicons name="heart" size={28} color="#131313" />
          </View>
          <Text style={[styles.lockedTitle, { color: theme.text }]}>
            Pair with your partner
          </Text>
          <Text style={[styles.lockedSub, { color: theme.textDim }]}>
            Sign in, get a couple code, share it with your partner. Your
            wallpapers complete each other when you're close.
          </Text>
          <AnimatedButton
            onPress={() => router.push('/(auth)/login' as Href)}
            style={[styles.lockedBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.lockedBtnText}>Sign in</Text>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  }

  // Status banner pinned at the top of the grid, by current link state.
  const banner = (() => {
    if (link?.status === 'linked') {
      const partnerName = link.partner?.display_name ?? 'your partner';
      return (
        <AnimatedButton
          onPress={() => router.push('/couple/dashboard' as Href)}
          style={[styles.banner, { borderColor: theme.primary + '88' }]}
        >
          <View style={[styles.bannerIcon, { backgroundColor: theme.primary }]}>
            <Ionicons name="heart" size={18} color="#131313" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.text }]}>
              Linked with {partnerName}
            </Text>
            <Text style={styles.bannerBody}>
              {link.code} · tap for proximity dashboard
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
        </AnimatedButton>
      );
    }
    if (link?.status === 'pending') {
      return (
        <AnimatedButton
          onPress={() => router.push('/couple/linking' as Href)}
          style={[styles.banner, { borderColor: theme.primary + '88' }]}
        >
          <View style={[styles.bannerIcon, { backgroundColor: Colors.gold }]}>
            <Ionicons name="hourglass" size={18} color="#131313" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerTitle, { color: theme.text }]}>
              Waiting for partner
            </Text>
            <Text style={styles.bannerBody}>{link.code} · tap to view code</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
        </AnimatedButton>
      );
    }
    return (
      <AnimatedButton
        onPress={() => router.push('/couple/setup' as Href)}
        style={[styles.banner, { borderColor: theme.primary + '55' }]}
      >
        <View style={[styles.bannerIcon, { backgroundColor: theme.primary }]}>
          <Ionicons name="qr-code" size={18} color="#131313" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.bannerTitleRow}>
            <Text style={[styles.bannerTitle, { color: theme.text }]}>
              Pair your couple
            </Text>
            <PremiumLock />
          </View>
          <Text style={styles.bannerBody}>
            Generate a couple code or enter your partner's
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
      </AnimatedButton>
    );
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Couple Theme</Text>
        <View
          style={[styles.dot, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
        />
      </View>
      <Text style={[styles.subtitle, { color: theme.textDim }]}>
        Matching wallpapers that complete each other 💕
      </Text>

      <FlatList
        data={coupleWallpapers}
        keyExtractor={keyExtractor}
        numColumns={COLS}
        columnWrapperStyle={columnWrapper}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<View style={styles.headerWrap}>{banner}</View>}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        renderItem={renderItem}
      />
    </SafeAreaView>
  );
}
