import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

type TabMeta = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  center?: boolean;
};

// Visual order is fixed here regardless of <Tabs.Screen> declaration order.
// Layout: [AI] [Couple] [Gallery (center)] [Mood] [Settings]
const ORDER = ['ai', 'couple', 'index', 'mood', 'profile'] as const;
const META: Record<string, TabMeta> = {
  ai: { label: 'Generate', icon: 'sparkles' },
  couple: { label: 'Couple', icon: 'heart' },
  index: { label: 'Gallery', icon: 'images', center: true },
  mood: { label: 'Mood', icon: 'happy' },
  profile: { label: 'Settings', icon: 'settings' },
};

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const bottomPad = Math.max(insets.bottom, 8);
  const activeName = state.routes[state.index]?.name;

  // Stable handler — items only re-render when their own `focused`
  // changes (memo'd children below).
  const handlePress = useCallback(
    (routeKey: string, routeName: string, focused: boolean) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(routeName);
      }
    },
    [navigation],
  );

  return (
    <View
      style={[
        styles.bar,
        {
          height: 64 + bottomPad,
          paddingBottom: bottomPad,
          backgroundColor: theme.bg,
        },
      ]}
    >
      {ORDER.map((name) => {
        const route = state.routes.find((r) => r.name === name);
        if (!route) return null;
        const meta = META[name];
        const focused = activeName === name;
        return (
          <TabButton
            key={name}
            routeKey={route.key}
            routeName={route.name}
            label={meta.label}
            icon={meta.icon}
            center={meta.center}
            focused={focused}
            activeColor={theme.primary}
            onPress={handlePress}
          />
        );
      })}
    </View>
  );
}

const TabButton = memo(function TabButton({
  routeKey,
  routeName,
  label,
  icon,
  center,
  focused,
  activeColor,
  onPress,
}: {
  routeKey: string;
  routeName: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  center?: boolean;
  focused: boolean;
  activeColor: string;
  onPress: (routeKey: string, routeName: string, focused: boolean) => void;
}) {
  const handle = useCallback(
    () => onPress(routeKey, routeName, focused),
    [onPress, routeKey, routeName, focused],
  );

  if (center) {
    return (
      <Pressable onPress={handle} style={styles.centerSlot} hitSlop={8}>
        <View
          style={[
            styles.centerBtn,
            { backgroundColor: activeColor, shadowColor: activeColor },
          ]}
        >
          <Ionicons name={icon} size={26} color="#131313" />
        </View>
        <Text style={[styles.label, focused && { color: activeColor }]}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={handle} style={styles.sideSlot} hitSlop={8}>
      <Ionicons
        name={icon}
        size={22}
        color={focused ? activeColor : Colors.textDim}
      />
      <Text style={[styles.label, focused && { color: activeColor }]}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 8,
    backgroundColor: Colors.bg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
  },
  sideSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    paddingTop: 4,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
  },
  centerBtn: {
    width: 58,
    height: 58,
    borderRadius: Radius.xl,
    marginTop: -22, // elevates above the bar
    backgroundColor: Colors.pink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.pink,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textDim,
  },
});
