import {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

// Exact values from the splash spec.
const DIM_OPACITY = 0.4; // inactive heart
const ACTIVE_OPACITY = 1.0; // heart under the glass
const DIM_SCALE = 1.0;
const ACTIVE_SCALE = 1.2;
const GLOW_OPACITY = 0.3; // soft pink scanning glow

/**
 * Per-heart activation styles, derived continuously from the magnifying
 * glass `position` (0..2). A heart is fully "active" (bright pink, scaled
 * up, glowing) when the glass sits directly over it, and dims back to 40%
 * as the glass moves a full slot away — a smooth scanning highlight with no
 * JS-thread state changes (satisfies the "avoid re-renders" requirement).
 *
 * `finishing` (0 → 1) forces ALL hearts bright at the end of the sequence.
 *
 * Returns three animated styles per heart:
 *   - `containerStyle`: opacity + scale of the whole heart
 *   - `pinkStyle`: opacity of the pink overlay heart (cross-fades white → pink)
 *   - `glowStyle`: opacity + scale of the glow halo behind it
 */
export function useHeartStyles(
  index: number,
  position: SharedValue<number>,
  finishing: SharedValue<number>,
) {
  // `h` = 1 when the glass is exactly on this heart, 0 once a full slot away,
  // forced to 1 for every heart while finishing. Inlined per worklet so each
  // animated style is fully self-contained on the UI thread.
  const containerStyle = useAnimatedStyle(() => {
    const dist = Math.abs(position.value - index);
    const h = Math.max(interpolate(dist, [0, 0.5], [1, 0], 'clamp'), finishing.value);
    return {
      opacity: interpolate(h, [0, 1], [DIM_OPACITY, ACTIVE_OPACITY]),
      transform: [{ scale: interpolate(h, [0, 1], [DIM_SCALE, ACTIVE_SCALE]) }],
    };
  });

  const pinkStyle = useAnimatedStyle(() => {
    const dist = Math.abs(position.value - index);
    const h = Math.max(interpolate(dist, [0, 0.5], [1, 0], 'clamp'), finishing.value);
    return { opacity: h };
  });

  const glowStyle = useAnimatedStyle(() => {
    const dist = Math.abs(position.value - index);
    const h = Math.max(interpolate(dist, [0, 0.5], [1, 0], 'clamp'), finishing.value);
    return {
      opacity: h * GLOW_OPACITY,
      transform: [{ scale: interpolate(h, [0, 1], [0.6, 1]) }],
    };
  });

  return { containerStyle, pinkStyle, glowStyle };
}
