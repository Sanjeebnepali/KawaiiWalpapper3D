import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { type MoodDef } from '../constants/moods';
import { Colors, Radius } from '../constants/theme';
import { AnimatedButton } from './AnimatedButton';

type Props = {
  mood: MoodDef;
  selected: boolean;
  size: number;
  onPress: () => void;
};

/**
 * One emoji mood button on the Mood Home screen.
 *
 * Visuals:
 *  - rounded glass card sized to `size × size * 1.2`
 *  - large centered emoji
 *  - label below
 *  - when `selected`, the card is filled with the mood's gradient and the
 *    emoji springs up slightly. The gradient fades in via a reanimated
 *    opacity transition (no second render of the card).
 */
function MoodEmojiButtonBase({ mood, selected, size, onPress }: Props) {
  const fillOpacity = useSharedValue(selected ? 1 : 0);
  const emojiLift = useSharedValue(selected ? 1.08 : 1);

  useEffect(() => {
    fillOpacity.value = withTiming(selected ? 1 : 0, { duration: 220 });
    emojiLift.value = withSpring(selected ? 1.08 : 1, {
      damping: 12,
      stiffness: 220,
    });
  }, [selected, fillOpacity, emojiLift]);

  const fillStyle = useAnimatedStyle(() => ({ opacity: fillOpacity.value }));
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: emojiLift.value }],
  }));

  return (
    <AnimatedButton
      onPress={onPress}
      style={[
        styles.card,
        {
          width: size,
          height: size * 1.2,
          borderColor: selected ? mood.tint : Colors.border,
          shadowColor: selected ? mood.tint : 'transparent',
        },
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
        <LinearGradient
          colors={mood.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.fillShade} />
      </Animated.View>

      <View style={styles.body}>
        <Animated.Text style={[styles.emoji, emojiStyle]}>
          {mood.emoji}
        </Animated.Text>
        <Text
          numberOfLines={1}
          style={[
            styles.label,
            { color: selected ? '#131313' : Colors.text },
          ]}
        >
          {mood.label}
        </Text>
      </View>
    </AnimatedButton>
  );
}

export const MoodEmojiButton = memo(MoodEmojiButtonBase);

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fillShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  emoji: {
    fontSize: 36,
    // Larger line-height on Android prevents emoji descender clipping when the
    // emoji springs up under the `overflow: hidden` card. Audit finding #9.
    lineHeight: 50,
    textAlign: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
