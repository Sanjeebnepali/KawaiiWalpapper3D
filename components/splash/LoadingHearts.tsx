import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { useHeartStyles } from '../../lib/animations/useHeartAnimation';
import { useMagnifyAnimation } from '../../lib/animations/useMagnifyAnimation';

// Exact layout values from the splash spec.
const HEART_SIZE = 32;
const HEART_SPACING = 60; // centre-to-centre
const HEART_GAP = HEART_SPACING - HEART_SIZE; // edge-to-edge gap between hearts
const ROW_WIDTH = HEART_SPACING * 2 + HEART_SIZE; // exactly fits 3 hearts
const MAGNIFY_SIZE = 48;
const HOVER_HEIGHT = 20; // glass rests this far above the hearts (via layout)
const GLOW_SIZE = HEART_SIZE + 28; // ~14px halo each side
const WRAP_HEIGHT = MAGNIFY_SIZE + HOVER_HEIGHT + HEART_SIZE;

const PINK = '#FF9EBC';
const GOLD = '#D7A33E';
const GOLD_HI = '#F2CE78';

/** One heart: a glow halo, a white base heart, and a pink overlay that
 *  cross-fades in as the glass scans over it. */
function HeartCell({
  index,
  position,
  finishing,
}: {
  index: number;
  position: SharedValue<number>;
  finishing: SharedValue<number>;
}) {
  const { containerStyle, pinkStyle, glowStyle } = useHeartStyles(
    index,
    position,
    finishing,
  );
  return (
    <View style={styles.heartSlot}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={containerStyle}>
        <Ionicons name="heart" size={HEART_SIZE} color="#FFFFFF" />
        <Animated.View style={[StyleSheet.absoluteFill, styles.center, pinkStyle]}>
          <Ionicons name="heart" size={HEART_SIZE} color={PINK} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Gold magnifying glass with a white heart in the lens — built from Views
 *  (no bespoke PNG) so it can be tinted and animated freely, with the small
 *  drop shadow the spec calls for. */
function MagnifyingGlass() {
  return (
    <View style={styles.magnify}>
      <View style={styles.handle} />
      <View style={styles.lens}>
        <Ionicons name="heart" size={13} color="#FFFFFF" />
      </View>
    </View>
  );
}

/**
 * Loading hearts + scanning magnifying glass.
 *
 * - `progress`: 0 → 1 group fade-in (driven by the parent splash sequence).
 * - `finishing`: 0 → 1 at app-load (all hearts bright + glass spins).
 *
 * The glass is centred over the row and translated to each heart; the hearts
 * read their highlight from the same shared `position`, so they light up in
 * lock-step with the glass.
 */
function LoadingHeartsBase({
  progress,
  finishing,
}: {
  progress: SharedValue<number>;
  finishing: SharedValue<number>;
}) {
  const positions: readonly [number, number, number] = [
    -HEART_SPACING,
    0,
    HEART_SPACING,
  ];
  const { position, magnifyStyle } = useMagnifyAnimation(positions, finishing);

  const groupStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View style={[styles.wrap, groupStyle]}>
      <View style={styles.row}>
        <HeartCell index={0} position={position} finishing={finishing} />
        <HeartCell index={1} position={position} finishing={finishing} />
        <HeartCell index={2} position={position} finishing={finishing} />
      </View>
      <View style={styles.magnifyLayer} pointerEvents="none">
        <Animated.View style={magnifyStyle}>
          <MagnifyingGlass />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export const LoadingHearts = memo(LoadingHeartsBase);

const styles = StyleSheet.create({
  wrap: {
    width: ROW_WIDTH,
    height: WRAP_HEIGHT,
  },
  // Hearts pinned to the bottom of the wrap; glass layer fills the top.
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HEART_SIZE,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: HEART_GAP,
  },
  magnifyLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: MAGNIFY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartSlot: {
    width: HEART_SIZE,
    height: HEART_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: PINK,
    top: (HEART_SIZE - GLOW_SIZE) / 2,
    left: (HEART_SIZE - GLOW_SIZE) / 2,
  },
  magnify: {
    width: MAGNIFY_SIZE,
    height: MAGNIFY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle drop shadow below the icon.
    shadowColor: '#3a2a00',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  lens: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 4,
    borderColor: GOLD,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    position: 'absolute',
    width: 7,
    height: 17,
    borderRadius: 4,
    backgroundColor: GOLD_HI,
    right: 6,
    bottom: 3,
    transform: [{ rotate: '45deg' }],
  },
});
