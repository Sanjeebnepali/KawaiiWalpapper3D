import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo } from 'react';
import {
  FlatList,
  type ListRenderItem,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { HistoryRow } from '../../components/moodHistoryScreen/HistoryRow';
import { styles } from '../../components/moodHistoryScreen/styles';
import { premiumAlert } from '../../components/PremiumAlert';
import {
  MOOD_BY_ID,
  type MoodId,
} from '../../constants/moods';
import { Colors, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  MOOD_HISTORY_LIMIT,
  type MoodHistoryEntry,
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
