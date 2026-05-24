import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { MOOD_BY_ID, type MoodId } from '../../constants/moods';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { tallyMoodBuckets } from '../../lib/moodBucket';
import { type PickRow } from './pickRow.types';
import { styles } from './styles';

export function CollectionRow({
  row,
  selected,
  onPick,
}: {
  row: PickRow;
  selected: boolean;
  onPick: () => void;
}) {
  const theme = useTheme();
  // Defensive: a malformed row with no photoIds array used to throw here.
  const tally = useMemo(
    () => tallyMoodBuckets(Array.isArray(row.photoIds) ? row.photoIds : []),
    [row.photoIds],
  );
  const photoCount = Array.isArray(row.photoIds) ? row.photoIds.length : 0;

  return (
    <AnimatedButton
      onPress={onPick}
      style={[
        styles.row,
        selected && { borderColor: theme.primary, shadowColor: theme.primary },
      ]}
    >
      <View style={styles.thumbWrap}>
        <Image
          source={{ uri: row.thumb }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={80}
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={styles.thumbFade}
          pointerEvents="none"
        />
        <View style={[styles.kindPill, { backgroundColor: theme.primary }]}>
          <Text style={styles.kindPillText}>
            {row.kind === 'pack' ? 'PACK' : 'YOURS'}
          </Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {row.name}
        </Text>
        <Text style={styles.meta}>
          {photoCount} photos · {selected ? 'Active for mood mode' : 'Tap to pick'}
        </Text>
        <View style={styles.tallyRow}>
          {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
            const m = MOOD_BY_ID[mid];
            const c = tally[mid];
            return (
              <View key={mid} style={styles.tallyCell}>
                <Text style={[styles.tallyEmoji, c === 0 && { opacity: 0.3 }]}>
                  {m.emoji}
                </Text>
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
      </View>

      {selected ? (
        <Ionicons name="checkmark-circle" size={22} color={theme.primary} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
      )}
    </AnimatedButton>
  );
}
