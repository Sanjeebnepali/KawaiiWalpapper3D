import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, View } from 'react-native';
import { AnimatedButton } from '../AnimatedButton';
import { getPhotoById } from '../../constants/mockData';
import {
  type Collection,
  COLLECTION_SIZE,
  getCollectionIntervalMinutes,
  SHUFFLE_MODES,
  TIMER_OPTIONS,
} from '../../constants/shuffle';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { styles } from './styles';

export function UserCollectionRow({
  collection,
  active,
  onPress,
  onLongPress,
}: {
  collection: Collection;
  active: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const hero = getPhotoById(collection.photoIds[0] ?? '')?.image;
  const mode = SHUFFLE_MODES.find((m) => m.id === collection.mode);
  const timer = TIMER_OPTIONS.find((t) => t.id === collection.timerId);
  const minutes = getCollectionIntervalMinutes(collection);
  // Day-based ignores the timer (it rotates at midnight), so label it as
  // such instead of a misleading "Every N min".
  const timerLabel =
    collection.mode === 'day'
      ? 'Daily'
      : timer?.id === 'custom'
        ? `${minutes} min`
        : timer?.label ?? `${minutes} min`;

  return (
    <AnimatedButton
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.userRow,
        active && { borderColor: theme.primary, borderWidth: 1.5 },
      ]}
      scaleTo={0.98}
    >
      {hero ? (
        <Image
          source={{ uri: hero }}
          style={styles.userHero}
          contentFit="cover"
          transition={0}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.userHero, styles.userHeroEmpty]}>
          <Ionicons name="image-outline" size={20} color={Colors.textDim} />
        </View>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.65)']}
        style={styles.userHeroFade}
        pointerEvents="none"
      />

      <View style={styles.userBody}>
        <View style={styles.userTitleRow}>
          <Text style={[styles.userTitle, { color: theme.text }]} numberOfLines={1}>
            {collection.name}
          </Text>
          {active ? (
            <View style={[styles.livePill, { backgroundColor: theme.primary }]}>
              <View style={styles.liveDot} />
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.userMetaRow}>
          <View style={styles.userMetaChip}>
            <Ionicons name="images-outline" size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{collection.photoIds.length}/{COLLECTION_SIZE}</Text>
          </View>
          <View style={styles.userMetaChip}>
            <Ionicons name={mode?.icon ?? 'shuffle'} size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{mode?.label ?? 'Sequential'}</Text>
          </View>
          <View style={styles.userMetaChip}>
            <Ionicons name="time-outline" size={11} color={Colors.textDim} />
            <Text style={styles.userMetaText}>{timerLabel}</Text>
          </View>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
    </AnimatedButton>
  );
}
