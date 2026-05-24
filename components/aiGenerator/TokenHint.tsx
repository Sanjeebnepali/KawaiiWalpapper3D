import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../../constants/theme';
import type { AIProvider } from '../../lib/ai/types';
import { styles } from './styles';

type Props = {
  provider: AIProvider;
  onPress: () => void;
};

export function TokenHint({ provider, onPress }: Props) {
  return (
    /* Token state hint */
    <Animated.View entering={FadeInDown.delay(170).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        style={styles.tokenHint}
      >
        <Ionicons name="key-outline" size={14} color={Colors.gold} />
        <Text style={styles.tokenHintText}>
          No {provider.displayName} token yet — tap to add in Settings.
        </Text>
      </Pressable>
    </Animated.View>
  );
}
