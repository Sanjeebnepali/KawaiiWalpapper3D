import { Ionicons } from '@expo/vector-icons';
import { type Href, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { getMoodOrDefault } from '../../constants/moods';
import { Colors } from '../../constants/theme';
import { type MoodHistoryEntry } from '../../lib/moodHistory';
import { formatTime } from '../../lib/formatMoodTime';
import { SourcePill } from './SourcePill';
import { styles } from './styles';

export function HistoryRow({ item }: { item: MoodHistoryEntry }) {
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
