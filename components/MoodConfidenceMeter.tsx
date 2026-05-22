import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { type MoodDef } from '../constants/moods';
import { Colors, Radius, Spacing } from '../constants/theme';

type Props = {
  mood: MoodDef | null;
  /** 0–1. Drives the bar width and the % label. */
  confidence: number;
  /** When true, a soft pulse animates on the active row. */
  live?: boolean;
};

/**
 * "Happy  92%" + a horizontal bar that fills proportional to the detector's
 * top-1 confidence. Used on the Camera Mood screen and in the History row.
 *
 * Animation:
 *  - bar width: spring on change (snappy, not bouncy)
 *  - bar fill: tween 220 ms on mood change so the colour cross-fades
 *  - %: rendered as plain text (cheap re-render — happens at most once
 *    every 60 s in steady state)
 */
export function MoodConfidenceMeter({ mood, confidence, live = false }: Props) {
  const widthPct = useSharedValue(0);
  const pulse = useSharedValue(0.85);

  useEffect(() => {
    widthPct.value = withSpring(Math.max(0, Math.min(1, confidence)), {
      damping: 18,
      stiffness: 180,
    });
  }, [confidence, widthPct]);

  useEffect(() => {
    if (!live) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0.85, { duration: 200 });
      return;
    }
    // Breathing pulse on the UI thread — no JS-side setInterval. Audit #8.
    pulse.value = withRepeat(
      withTiming(1, { duration: 900 }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulse);
    };
  }, [live, pulse]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${widthPct.value * 100}%`,
    backgroundColor: mood?.tint ?? Colors.text,
    opacity: pulse.value,
  }));

  const pct = Math.round(Math.max(0, Math.min(1, confidence)) * 100);
  const label = mood?.label ?? 'No face';

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <View style={styles.heading}>
          <Text style={styles.emoji}>{mood?.emoji ?? '·'}</Text>
          <Text style={[styles.title, { color: Colors.text }]}>{label}</Text>
        </View>
        <Text style={[styles.pct, { color: mood?.tint ?? Colors.textDim }]}>
          {pct}%
        </Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.bar, barStyle]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emoji: { fontSize: 20 },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  pct: {
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceHi,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});
