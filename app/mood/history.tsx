import { Ionicons } from '@expo/vector-icons';
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
import { premiumAlert } from '../../components/PremiumAlert';
import {
  getMoodOrDefault,
  MOOD_BY_ID,
  type MoodId,
} from '../../constants/moods';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  MOOD_HISTORY_LIMIT,
  type MoodHistoryEntry,
  type MoodSource,
} from '../../lib/moodHistory';
import { toast } from '../../lib/toast';
import { hydrateMoodStore, useMoodStore } from '../../store/mood';

/**
 * Mood History — chronological list of detections + manual selections.
 * Top row also surfaces a 7-mood "tally" so the user can see at a glance
 * what their week-of-feels looked like.
 */
export default function MoodHistoryScreen() {
  const router = useRouter();
  const theme = useTheme();
  const hydrated = useMoodStore((s) => s.hydrated);
  const history = useMoodStore((s) => s.history);
  const clearHistory = useMoodStore((s) => s.clearHistory);

  useEffect(() => {
    if (!hydrated) hydrateMoodStore();
  }, [hydrated]);

  const tally = useMemo(() => {
    const counts: Record<MoodId, number> = {
      happy: 0, sad: 0, angry: 0, calm: 0, excited: 0, surprised: 0, neutral: 0,
    };
    history.forEach((h) => {
      counts[h.moodId] = (counts[h.moodId] ?? 0) + 1;
    });
    return counts;
  }, [history]);

  const total = history.length;

  const onClear = useCallback(() => {
    if (total === 0) return;
    premiumAlert({
      title: 'Clear mood history',
      message: 'Remove the last 60 mood entries? This cannot be undone.',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            toast('Mood history cleared');
          },
        },
      ],
    });
  }, [total, clearHistory]);

  const renderItem = useCallback<ListRenderItem<MoodHistoryEntry>>(
    ({ item }) => <HistoryRow item={item} />,
    [],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Mood History</Text>
          <Text style={styles.subtitle}>
            {total === 0
              ? 'No moods yet'
              : `Last ${Math.min(total, MOOD_HISTORY_LIMIT)} entries`}
          </Text>
        </View>
        <AnimatedButton
          onPress={onClear}
          style={styles.backBtn}
          hitSlop={8}
          disabled={total === 0}
        >
          <Ionicons
            name="trash-outline"
            size={18}
            color={total === 0 ? Colors.textMute : Colors.error}
          />
        </AnimatedButton>
      </View>

      {total > 0 ? (
        <View style={styles.tallyRow}>
          {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
            const m = MOOD_BY_ID[mid];
            const c = tally[mid];
            return (
              <View
                key={mid}
                style={[
                  styles.tallyCell,
                  c > 0 && { borderColor: m.tint },
                ]}
              >
                <Text style={styles.tallyEmoji}>{m.emoji}</Text>
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
      ) : null}

      <FlatList
        data={history}
        keyExtractor={(h) => h.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="happy-outline" size={42} color={Colors.textDim} />
            <Text style={[styles.title, { color: theme.text, marginTop: Spacing.sm }]}>
              No moods yet
            </Text>
            <Text style={styles.helperText}>
              Tap an emoji on the Mood tab or run the camera detector — your
              moods land here with timestamps.
            </Text>
            <AnimatedButton
              onPress={() => router.replace('/(tabs)/mood' as Href)}
              style={[styles.backToCta, { borderColor: theme.primary }]}
            >
              <Text style={[styles.backToCtaText, { color: theme.primary }]}>
                Go to Mood
              </Text>
            </AnimatedButton>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function HistoryRow({ item }: { item: MoodHistoryEntry }) {
  const router = useRouter();
  const mood = getMoodOrDefault(item.moodId);
  const ts = formatTime(item.at);
  return (
    <AnimatedButton
      onPress={() => router.push(`/mood/${mood.id}` as Href)}
      style={[styles.row, { shadowColor: mood.tint }]}
    >
      <View
        style={[
          styles.rowEmojiWrap,
          { backgroundColor: mood.tint + '22', borderColor: mood.tint },
        ]}
      >
        <Text style={styles.rowEmoji}>{mood.emoji}</Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowTitle}>{mood.label}</Text>
          <SourcePill source={item.source} />
        </View>
        <Text style={styles.rowMeta}>
          {ts}
          {(item.source === 'camera' || item.source === 'background')
            ? ` · ${Math.round(item.confidence * 100)}% confidence`
            : ''}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
    </AnimatedButton>
  );
}

const SOURCE_STYLE: Record<
  MoodSource,
  { label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; dim: string }
> = {
  manual:       { label: 'Manual',  icon: 'hand-left-outline',   tint: Colors.pink,     dim: Colors.pinkDim },
  camera:       { label: 'Camera',  icon: 'scan-outline',        tint: Colors.cyan,     dim: Colors.cyanDim },
  background:   { label: 'Auto',    icon: 'sparkles-outline',    tint: Colors.cyan,     dim: Colors.cyanDim },
  notification: { label: 'Tap',     icon: 'notifications-outline', tint: Colors.gold,   dim: 'rgba(232,194,117,0.18)' },
  sleepwake:    { label: 'Sleep/Wake', icon: 'moon-outline',     tint: Colors.lavender, dim: Colors.lavenderDim },
};

function SourcePill({ source }: { source: MoodSource }) {
  const s = SOURCE_STYLE[source] ?? SOURCE_STYLE.manual;
  return (
    <View style={[styles.srcPill, { backgroundColor: s.dim }]}>
      <Ionicons name={s.icon} size={10} color={s.tint} />
      <Text style={[styles.srcPillText, { color: s.tint }]}>{s.label}</Text>
    </View>
  );
}

/** "Today 14:32" / "Yesterday 09:15" / "May 12, 14:32". */
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

  // tally
  tallyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  tallyCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tallyEmoji: { fontSize: 13 },
  tallyCount: { fontSize: 11, fontWeight: '800', minWidth: 12, textAlign: 'right' },

  // row
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
  rowEmojiWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEmoji: { fontSize: 22 },
  rowBody: { flex: 1, gap: 4 },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowTitle: { color: Colors.text, fontSize: 14, fontWeight: '800' },
  srcPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  srcPillText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  rowMeta: { color: Colors.textDim, fontSize: 11, fontWeight: '700' },

  // empty
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
    lineHeight: 18,
  },
  backToCta: {
    marginTop: Spacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  backToCtaText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
