import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { memo, useCallback } from 'react';
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
import { PremiumLock } from '../../components/PremiumLock';
import { SimpleButton } from '../../components/SimpleButton';
import { coupleWallpapers, type CoupleWallpaper } from '../../constants/mockData';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStatus } from '../../store/auth';
import { useCoupleLink } from '../../store/couple';

const COLS = 2;
const GAP = 12;
const SIDE = Spacing.lg;

const columnWrapper = { gap: GAP };
const Separator = () => <View style={{ height: GAP }} />;
const keyExtractor = (c: CoupleWallpaper) => c.id;

/**
 * A single couple-pack card. Shows ONLY the together image (the complete
 * two-character scene) — the boy/girl solo halves are never shown here;
 * they're revealed on the preview screen after a tap. Glows its pack accent.
 */
const CoupleCard = memo(function CoupleCard({
  item,
  width,
  height,
  onOpen,
}: {
  item: CoupleWallpaper;
  width: number;
  height: number;
  onOpen: (packId: string) => void;
}) {
  const handlePress = useCallback(() => onOpen(item.id), [onOpen, item.id]);
  return (
    <SimpleButton
      onPress={handlePress}
      style={[
        styles.card,
        { width, height, shadowColor: item.accent, borderColor: item.accent + '55' },
      ]}
    >
      <Image
        source={item.image}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={140}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={[styles.cardBadge, { backgroundColor: item.accent }]}>
        <Ionicons name="heart" size={11} color="#131313" />
        <Text style={styles.cardBadgeText}>Couple</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardHint} numberOfLines={1}>
          Tap to pick your side
        </Text>
      </View>
    </SimpleButton>
  );
});

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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    justifyContent: 'space-between',
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
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  subtitle: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  list: { paddingHorizontal: SIDE, paddingBottom: 120 },
  headerWrap: { paddingBottom: Spacing.md },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    // Soft accent glow — premium feel.
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  cardBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#131313',
    letterSpacing: 0.3,
  },
  cardFooter: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  cardHint: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTitle: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  bannerBody: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  lockedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  lockedGlyph: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  lockedTitle: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  lockedSub: {
    color: Colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  lockedBtn: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: Radius.pill,
    alignItems: 'center',
  },
  lockedBtnText: { color: '#131313', fontSize: 15, fontWeight: '800' },
});
