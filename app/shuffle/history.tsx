import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback } from 'react';
import {
  FlatList,
  type ListRenderItem,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { HISTORY_LIMIT, type ShuffleHistoryItem } from '../../constants/shuffle';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { toast } from '../../lib/toast';
import {
  useFavoritesStore,
  useToggleFavorite,
} from '../../store/favorites';
import { useShuffleStore } from '../../store/shuffle';

/**
 * History screen — the last `HISTORY_LIMIT` (30) wallpaper changes.
 * Tapping a row opens the wallpaper preview; the heart button toggles the
 * photo in the existing favorites store.
 */
export default function ShuffleHistory() {
  const router = useRouter();
  const theme = useTheme();
  const history = useShuffleStore((s) => s.history);
  const clearHistory = useShuffleStore((s) => s.clearHistory);

  const renderItem = useCallback<ListRenderItem<ShuffleHistoryItem>>(
    ({ item }) => <HistoryRow item={item} />,
    [],
  );

  const onClear = useCallback(() => {
    if (history.length === 0) return;
    premiumAlert({
      title: 'Clear history',
      message: 'Remove all shuffle history? Favorites and collections are kept.',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearHistory();
            toast('History cleared');
          },
        },
      ],
    });
  }, [history.length, clearHistory]);

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
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>History</Text>
          <Text style={styles.subtitle}>
            {history.length === 0
              ? 'No shuffles yet'
              : `Last ${Math.min(history.length, HISTORY_LIMIT)} changes`}
          </Text>
        </View>
        <AnimatedButton
          onPress={onClear}
          style={styles.backBtn}
          hitSlop={8}
          disabled={history.length === 0}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={history.length === 0 ? Colors.textMute : Colors.error}
          />
        </AnimatedButton>
      </View>

      <FlatList
        data={history}
        keyExtractor={(h, i) => `${h.photoId}-${h.at}-${i}`}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="time-outline" size={36} color={Colors.textDim} />
            <Text style={[styles.title, { color: theme.text, marginTop: Spacing.sm }]}>
              No history yet
            </Text>
            <Text style={styles.helperText}>
              When the shuffle changes wallpapers, recent picks land here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function HistoryRow({ item }: { item: ShuffleHistoryItem }) {
  const router = useRouter();
  const theme = useTheme();
  // Single-id favorite subscription — only re-renders when THIS photo's
  // favorite status flips, not when any history row changes.
  const isFav = useFavoritesStore((s) => s.ids.includes(item.photoId));
  const toggleFav = useToggleFavorite();

  const onPress = () => router.push(`/wallpaper/${item.photoId}`);
  const onHeart = () => {
    const next = !isFav;
    toggleFav(item.photoId);
    toast(next ? '✓ Added to favorites' : 'Removed from favorites');
  };

  return (
    <AnimatedButton onPress={onPress} style={styles.row}>
      <Image
        source={{ uri: item.image }}
        style={styles.thumb}
        contentFit="cover"
        transition={80}
        cachePolicy="memory-disk"
      />
      <View style={styles.body}>
        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
          {item.photoId}
        </Text>
        <Text style={styles.meta}>{formatTime(item.at)}</Text>
      </View>
      <AnimatedButton
        onPress={onHeart}
        style={styles.heartBtn}
        hitSlop={6}
      >
        <Ionicons
          name={isFav ? 'heart' : 'heart-outline'}
          size={18}
          color={isFav ? theme.primary : Colors.textDim}
        />
      </AnimatedButton>
    </AnimatedButton>
  );
}

/** "Today 14:32", "Yesterday 09:15", or "May 12, 14:32" for older entries. */
function formatTime(epoch: number): string {
  const d = new Date(epoch);
  const now = new Date();
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (same(d, now)) return `Today ${hhmm}`;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (same(d, yesterday)) return `Yesterday ${hhmm}`;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${hhmm}`;
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
  subtitle: { color: Colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 140 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  thumb: {
    width: 48,
    height: 64,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHi,
  },
  body: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 13, fontWeight: '700' },
  meta: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
  heartBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceHi,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: Spacing.xl,
  },
  helperText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
