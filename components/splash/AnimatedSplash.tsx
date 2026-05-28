import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { LoadingHearts } from './LoadingHearts';

// Keep the native splash up until our JS splash has painted, so there is no
// white flash on cold start. Best-effort — never throws if already hidden.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Display timing. MIN_MS must outlast the magnifying-glass sequence so the
// scan is actually seen: the glass drops in at ~1100ms (ENTER_DELAY 600 +
// ENTER_MS 500 in useMagnifyAnimation) and one full left→centre→right→centre
// sweep takes ~4000ms. At the old MIN_MS=2000 the splash dismissed before the
// glass left the first heart, so it read as a blank colour. 4200ms lets a full
// sweep across all three hearts play out before the exit spin.
const MIN_MS = 4200; // minimum splash display time (covers one full scan)
const MAX_MS = 6500; // hard cap — always dismiss by here
const FADE_IN = 800; // splash image fades in
const BOUNCE_IN = 600; // subtle character (image) bounce-in
const OVERLAY_DELAY = 300; // hearts appear after the image
const EXIT_FADE = 500; // fade out to the app

// Gradient that matches the splash art — ALSO the fallback shown if the
// image fails to load (error-handling requirement).
const GRAD = ['#b78fc8', '#d49ec6', '#e7a6c2'] as const;
// Scrim colour = the artwork's lower pink, used to mask the baked-in static
// hearts so our LIVE animated hearts read cleanly.
const SCRIM = ['rgba(231,166,194,0)', 'rgba(231,166,194,0.92)', 'rgba(231,166,194,0.98)'] as const;

/**
 * Animated splash overlay. Mounted on top of the app at root; fades itself
 * out and calls `onFinish` (which unmounts it) — the app is already routed
 * underneath, so there is nothing to navigate to.
 *
 * Sequence: image fades in (800ms) with a subtle bounce → hearts + glass fade
 * in → glass scans the 3 hearts infinitely → on load, all hearts brighten and
 * the glass spins 360° → screen fades out (500ms). Always dismisses between
 * MIN_MS and MAX_MS even if an animation stalls.
 */
export function AnimatedSplash({ onFinish }: { onFinish: () => void }) {
  const { height } = useWindowDimensions();
  const [imgFailed, setImgFailed] = useState(false);

  const container = useSharedValue(1); // whole-screen opacity (1 → 0 on exit)
  const imageOpacity = useSharedValue(0); // image fades in over the gradient
  const imageScale = useSharedValue(0.94); // subtle bounce-in
  const overlay = useSharedValue(0); // hearts/glass group fade-in
  const finishing = useSharedValue(0); // 0 → 1: all hearts bright + glass spin

  const finishedRef = useRef(false);

  useEffect(() => {
    // Hand off the native splash → this JS splash now that we have mounted.
    SplashScreen.hideAsync().catch(() => {});

    imageOpacity.value = withTiming(1, { duration: FADE_IN, easing: Easing.out(Easing.ease) });
    imageScale.value = withTiming(1, { duration: BOUNCE_IN, easing: Easing.out(Easing.back(1.3)) });
    overlay.value = withDelay(
      OVERLAY_DELAY,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
    );

    const exit = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      // All 3 hearts bright + glass 360° spin, then fade the whole screen out.
      finishing.value = withTiming(1, { duration: 300, easing: Easing.inOut(Easing.ease) });
      container.value = withDelay(
        350,
        withTiming(0, { duration: EXIT_FADE, easing: Easing.in(Easing.ease) }, (done) => {
          if (done) runOnJS(onFinish)();
        }),
      );
    };

    // Hydration kicked off in _layout is fire-and-forget and fast, so MIN_MS is
    // the effective display time; MAX_MS guarantees we ALWAYS dismiss even if
    // something stalls (error-handling requirement). runOnJS-safe timers.
    const minTimer = setTimeout(exit, MIN_MS);
    const maxTimer = setTimeout(exit, MAX_MS);
    return () => {
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [container, finishing, imageOpacity, imageScale, overlay, onFinish]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: container.value }));
  const imageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
    transform: [{ scale: imageScale.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, containerStyle]}>
      {/* Always-visible base — also the image-load-failure fallback. */}
      <LinearGradient colors={GRAD} style={StyleSheet.absoluteFill} />

      {!imgFailed ? (
        <Animated.View style={[StyleSheet.absoluteFill, imageStyle]}>
          <Image
            source={require('../../assets/splash-kawaii.png')}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={0}
            onError={() => setImgFailed(true)}
          />
        </Animated.View>
      ) : null}

      <LinearGradient
        colors={SCRIM}
        style={[styles.scrim, { height: height * 0.22 }]}
        pointerEvents="none"
      />

      <View style={[styles.heartsHost, { bottom: height * 0.07 }]} pointerEvents="none">
        <LoadingHearts progress={overlay} finishing={finishing} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: GRAD[0],
    zIndex: 999,
    elevation: 999,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  heartsHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
