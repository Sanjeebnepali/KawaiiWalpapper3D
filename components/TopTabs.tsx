import { type Href, useRouter } from 'expo-router';
import { memo, useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { topTabs, type TopTab } from '../constants/mockData';
import { Colors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

// 'wallpapers' stays on Home; the rest navigate to their own screens.
// (Couple Theme + Mood Based moved to the bottom tab bar — Issue 2.)
const ROUTE_BY_TAB: Record<string, string | null> = {
  wallpapers: null,
  '2d': '/wallpapers/2d-kawaii',
  // "Premium Collection" tab → the real premium grid (Supabase premium/ images,
  // diamond + paywall), not the old dual-pair mock screen.
  dual: '/category/premium',
  'theme-packs': '/wallpapers/theme-packs',
};

// Soft, quick spring — visible but not jarring (Issue 1).
const SPRING = { damping: 14, stiffness: 140 };

/**
 * One top tab. A reanimated `withSpring` shared value (`progress`, 0→1) drives
 * both the underline (scaleX + opacity) and the label color. The active tab's
 * underline springs in on mount; inactive tabs spring it in on press-in for
 * tactile feedback before navigation.
 *
 * Memoized so tapping one tab doesn't re-render the other three (each row
 * owns its own animation state).
 */
const TopTabItem = memo(function TopTabItem({
  tab,
  isActive,
  onPress,
}: {
  tab: TopTab;
  isActive: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, SPRING);
  }, [isActive, progress]);

  const onPressIn = () => {
    if (!isActive) progress.value = withSpring(1, SPRING);
  };
  const onPressOut = () => {
    if (!isActive) progress.value = withSpring(0, SPRING);
  };

  const underlineStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.value }],
    opacity: progress.value,
  }));

  const labelStyle = useAnimatedStyle(
    () => ({
      color: interpolateColor(
        progress.value,
        [0, 1],
        [Colors.textDim, theme.text],
      ),
    }),
    [theme],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
      android_ripple={{ color: 'rgba(255,255,255,0.12)', borderless: true }}
      style={styles.tab}
    >
      <Animated.Text style={[styles.label, labelStyle]}>
        {tab.label}
      </Animated.Text>
      <Animated.View
        style={[
          styles.underline,
          { backgroundColor: theme.primary, shadowColor: theme.primary },
          underlineStyle,
        ]}
      />
    </Pressable>
  );
});

function TopTabsBase() {
  const router = useRouter();
  // 'wallpapers' is always the active tab on Home — the others are separate screens.
  const activeId = 'wallpapers';

  const handlePress = useCallback(
    (tabId: string) => {
      const route = ROUTE_BY_TAB[tabId];
      // Cast: these routes exist but expo-router's typedRoutes union only
      // refreshes once Metro regenerates .expo/types.
      if (route) router.push(route as Href);
    },
    [router],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {topTabs.map((tab) => (
        <TopTabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeId}
          onPress={() => handlePress(tab.id)}
        />
      ))}
    </ScrollView>
  );
}

export const TopTabs = memo(TopTabsBase);

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  tab: {
    // Bigger tappable area — was just the label height, which made the
    // tabs fiddly to hit. Vertical + horizontal padding plus the Pressable
    // hitSlop give a comfortable target without changing the visual layout.
    alignItems: 'center',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
  },
  underline: {
    marginTop: Spacing.sm,
    height: 3,
    width: '100%',
    borderRadius: 2,
    shadowOpacity: 0.7,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
});
