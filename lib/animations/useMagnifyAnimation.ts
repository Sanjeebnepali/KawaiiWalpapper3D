import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// Exact timing values from the splash spec.
const TRAVEL_MS = 600; // travel time between hearts
const PAUSE_MS = 400; // pause on each heart
const FLOAT_AMP = 6; // vertical hover amplitude (px)
const FLOAT_MS = 1000; // one up/down float cycle
const ENTER_MS = 500; // drop-in duration
const ENTER_DELAY = 600; // wait for the hearts to appear first
const DROP_PX = 44; // how far above it drops in from

/**
 * Magnifying-glass animation.
 *
 * Drives a single continuous `position` shared value that sweeps
 * 0 → 1 → 2 → 1 → 0 forever (left → centre → right → centre → left). BOTH
 * this hook (for the glass translateX) and `useHeartStyles` read it, so the
 * active-heart highlight always tracks the glass with zero JS-thread work.
 *
 * - `positions`: x-translate (px) for each of the 3 hearts, e.g. [-60, 0, 60].
 * - `finishing`: 0 → 1 on app-load; cancels the scan and spins the glass 360°.
 *
 * Returns the shared `position` (for the hearts) and the glass animated style.
 * All animations are cancelled on unmount — no leaks.
 */
export function useMagnifyAnimation(
  positions: readonly [number, number, number],
  finishing: SharedValue<number>,
) {
  const position = useSharedValue(0);
  const floatT = useSharedValue(0);
  const enter = useSharedValue(0);

  useEffect(() => {
    // Drop in from above with a slight bounce.
    enter.value = withDelay(
      ENTER_DELAY,
      withTiming(1, { duration: ENTER_MS, easing: Easing.out(Easing.back(1.6)) }),
    );

    // Continuous left → right → left scan, pausing on each heart.
    const scan = withSequence(
      withTiming(1, { duration: TRAVEL_MS, easing: Easing.inOut(Easing.ease) }),
      withDelay(PAUSE_MS, withTiming(2, { duration: TRAVEL_MS, easing: Easing.inOut(Easing.ease) })),
      withDelay(PAUSE_MS, withTiming(1, { duration: TRAVEL_MS, easing: Easing.inOut(Easing.ease) })),
      withDelay(PAUSE_MS, withTiming(0, { duration: TRAVEL_MS, easing: Easing.inOut(Easing.ease) })),
      withDelay(PAUSE_MS, withTiming(0, { duration: 1 })),
    );
    position.value = withDelay(ENTER_DELAY + ENTER_MS, withRepeat(scan, -1, false));

    // Vertical float — runs simultaneously and forever, mirrored each cycle.
    floatT.value = withRepeat(
      withTiming(1, { duration: FLOAT_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(position);
      cancelAnimation(floatT);
      cancelAnimation(enter);
    };
  }, [enter, floatT, position]);

  // When the app finishes loading, freeze the scan so the glass spins in place.
  useAnimatedReaction(
    () => finishing.value,
    (v, prev) => {
      if (v > 0 && (prev === null || prev === 0)) {
        cancelAnimation(position);
      }
    },
  );

  const magnifyStyle = useAnimatedStyle(() => {
    const x = interpolate(position.value, [0, 1, 2], positions as unknown as number[]);
    const floatY = interpolate(floatT.value, [0, 1], [-FLOAT_AMP, FLOAT_AMP]);
    const dropY = interpolate(enter.value, [0, 1], [-DROP_PX, 0]);
    const scale = interpolate(enter.value, [0, 1], [0.5, 1]);
    return {
      opacity: enter.value,
      transform: [
        { translateX: x },
        { translateY: floatY + dropY },
        { rotate: `${finishing.value * 360}deg` },
        { scale },
      ],
    };
  });

  return { position, magnifyStyle };
}
