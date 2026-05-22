import { type ReactNode } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const SPRING = { damping: 16, stiffness: 240 };

// Single animated host: the Pressable itself carries the transform via
// Reanimated's animated style. Drops one View per tap surface — see
// changes/020 (30+ buttons on Home → 30+ fewer Views in the tree).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** Scale target while pressed. Default 0.96 — subtle, not bouncy. */
  scaleTo?: number;
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  /**
   * Layout-shell style merged ahead of `style` and the animated transform.
   * Originally introduced (changes/018) so flex-grid tiles like ThemePicker
   * (`width: '31%'`) could parent the Pressable. With AnimatedPressable
   * this just folds into the composed style — kept for back-compat with
   * existing call sites.
   */
  wrapperStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Pressable with a reanimated press-scale. Same API as Pressable plus an
 * optional `scaleTo`. Uses a worklet on a shared value (no re-renders on
 * press). Layout / hit area are unchanged — the transform is on the Pressable
 * itself via Animated.createAnimatedComponent, so the bounds are stable AND
 * there's no extra view in the tree per button.
 */
export function AnimatedButton({
  scaleTo = 0.96,
  style,
  wrapperStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: GestureResponderEvent) => {
    scale.value = withSpring(scaleTo, SPRING);
    onPressIn?.(e);
  };
  const handlePressOut = (e: GestureResponderEvent) => {
    scale.value = withSpring(1, SPRING);
    onPressOut?.(e);
  };

  // Pressable's style can be either a value or a function of {pressed}.
  // Preserve both call-signatures so existing call sites don't need touching.
  const composedStyle: PressableProps['style'] =
    typeof style === 'function'
      ? (s) => [wrapperStyle, style(s), animatedStyle] as StyleProp<ViewStyle>
      : ([wrapperStyle, style, animatedStyle] as StyleProp<ViewStyle>);

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={composedStyle}
    >
      {children as ReactNode}
    </AnimatedPressable>
  );
}
