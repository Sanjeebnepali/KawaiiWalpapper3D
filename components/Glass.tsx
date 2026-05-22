import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Tint = 'dark' | 'light' | 'default';

type Props = {
  /** iOS BlurView intensity (0–100). Ignored on Android. */
  intensity?: number;
  /** iOS BlurView tint. Ignored on Android. */
  tint?: Tint;
  /** Style applied to the wrapper. */
  style?: StyleProp<ViewStyle>;
  /**
   * Translucent solid fill used on Android instead of a BlurView. Each
   * BlurView on Android is a real-time GPU blur — stacking many tanks the
   * frame rate, even on flagship devices with API 31+'s RenderEffect path.
   * Defaults to a dark glass-ish overlay.
   */
  androidFill?: string;
  children?: ReactNode;
};

/**
 * Platform-aware "frosted glass" panel.
 *
 * - **iOS**: real `BlurView` (native UIVisualEffectView — cheap, no JS cost).
 * - **Android**: translucent `View` with a fixed dark fill. Visually close
 *   enough to a frosted look behind dark UI; massively cheaper than running
 *   N BlurViews on the GPU per frame.
 *
 * Use this everywhere the design called for a `BlurView`. It's the single
 * seam — if the Android blur perf story improves (or we want to pay the
 * cost for one specific surface), flip behaviour in one place.
 */
export function Glass({
  intensity = 40,
  tint = 'dark',
  style,
  androidFill,
  children,
}: Props) {
  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          // 0.55 alpha against the app's #131313 bg approximates the dark
          // BlurView look closely enough at typical zoom levels.
          { backgroundColor: androidFill ?? 'rgba(20,20,20,0.62)' },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}

/** Convenience: `Glass` filling its parent (absolute, like StyleSheet.absoluteFill). */
export function GlassAbsoluteFill(
  props: Omit<Props, 'style'> & { style?: StyleProp<ViewStyle> },
) {
  return <Glass {...props} style={[StyleSheet.absoluteFill, props.style]} />;
}
