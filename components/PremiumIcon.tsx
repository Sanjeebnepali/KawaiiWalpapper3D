import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';
import { GlassAbsoluteFill } from './Glass';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  label: string;
  active?: boolean;
  onPress: () => void;
};

const SPRING = { damping: 12, stiffness: 180 };

/**
 * Glassmorphism category icon: blurred translucent shell, faint gradient
 * sheen, reanimated press-scale, and a pink glow ring when active.
 *
 * Note: a true gradient-filled glyph would need @react-native-masked-view
 * (a native module). The icon stays solid in its accent colour; the gradient
 * lives in the shell sheen + the active glow.
 */
export function PremiumIcon({ icon, tint, label, active, onPress }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      style={styles.wrap}
      hitSlop={4}
    >
      <Animated.View
        style={[
          styles.shell,
          active && styles.shellActive,
          animatedStyle,
        ]}
      >
        <GlassAbsoluteFill intensity={18} tint="dark" />
        <LinearGradient
          colors={['rgba(255,255,255,0.07)', 'rgba(255,255,255,0.01)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Ionicons name={icon} size={24} color={active ? Colors.pink : tint} />
      </Animated.View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', gap: 6 },
  shell: {
    width: 60,
    height: 60,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  shellActive: {
    borderColor: Colors.pink,
    shadowColor: Colors.pink,
    shadowOpacity: 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  label: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  labelActive: { color: Colors.pink },
});
