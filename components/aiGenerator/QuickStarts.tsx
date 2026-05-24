import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SUGGESTIONS } from './constants';
import { styles } from './styles';

type Props = {
  setPrompt: (s: string) => void;
  busy: boolean;
};

export function QuickStarts({ setPrompt, busy }: Props) {
  return (
    /* Quick starts */
    <Animated.View entering={FadeInDown.delay(220).springify().damping(18)}>
      <Text style={styles.section}>Quick starts</Text>
      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <Pressable
            key={s}
            style={styles.chip}
            onPress={() => setPrompt(s)}
            disabled={busy}
          >
            <Text style={styles.chipText} numberOfLines={2}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>
    </Animated.View>
  );
}
