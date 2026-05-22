import { type ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  /** Opacity while pressed. Default 0.7. */
  pressedOpacity?: number;
};

/**
 * Zero-worklet press button — used inside list/grid cells where
 * `AnimatedButton`'s Reanimated `useSharedValue` + `useAnimatedStyle`
 * costs add up across 30+ cells.
 *
 * The press feedback is the platform-native opacity dim via Pressable's
 * `style={({ pressed }) => ...}`, which runs on the UI thread without
 * crossing into the worklet bridge. For a 2-col grid with 30 cells
 * (× 2 buttons each = 60 sites), this saves 60 worklet bridge setups
 * on mount — a measurable improvement on mid-range Android.
 *
 * Keep `AnimatedButton` for large, prominent buttons (Apply, Set,
 * top-tab CTAs) where the spring scale animation is part of the design.
 * Use `SimpleButton` everywhere inside a scrollable list cell.
 */
export function SimpleButton({
  style,
  children,
  pressedOpacity = 0.7,
  ...rest
}: Props) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && { opacity: pressedOpacity },
      ]}
    >
      {children}
    </Pressable>
  );
}
