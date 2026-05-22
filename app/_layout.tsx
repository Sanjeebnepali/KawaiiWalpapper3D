import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  initialWindowMetrics,
  SafeAreaProvider,
} from 'react-native-safe-area-context';
import { enableFreeze, enableScreens } from 'react-native-screens';
// Camera-based Mood Mode disabled in this build — see comment near the
// commented-out <MoodEngineHost /> below.
// import { MoodEngineHost } from '../components/MoodEngineHost';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { PremiumAlertHost } from '../components/PremiumAlert';
import { ShuffleEngineHost } from '../components/ShuffleEngineHost';
import { Colors } from '../constants/theme';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { bootstrapCoupleFeature } from '../lib/coupleBootstrap';
import { bootstrapMoodFeature } from '../lib/moodBootstrap';
import { hydrateAIStore } from '../store/ai';
import { useAuthStore } from '../store/auth';
import { hydrateFavoritesStore } from '../store/favorites';
import { hydrateSettingsStore } from '../store/settings';

// Use react-native-screens' native containers for every route — gives every
// stack frame a real native UIViewController / Fragment instead of a JS
// View tree. This is what makes nav transitions feel native.
enableScreens(true);

// Freeze off-screen routes so their children stop re-rendering / running
// effects while inactive. Cuts JS thread cost during route push so the
// incoming screen mounts faster (visible 1 s "freeze" on tap → ~150 ms).
enableFreeze(true);

/**
 * Inner stack — consumes the active theme so the navigation chrome and every
 * screen's background re-color when the user picks a theme in Settings
 * (Issue 5). `contentStyle.backgroundColor` themes the area behind every
 * route; individual screens also theme their own SafeAreaView.
 */
function RootStack() {
  const theme = useTheme();

  // Memo'd so the NavThemeProvider doesn't re-mount its descendants every
  // time RootStack re-renders for unrelated reasons.
  const navTheme = useMemo(
    () => ({
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        background: theme.bg,
        card: theme.bg,
        border: Colors.border,
        primary: theme.primary,
        text: theme.text,
      },
    }),
    [theme.bg, theme.primary, theme.text],
  );

  const screenOptions = useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: theme.bg },
      // 'simple_push' is the cheapest native Stack animation (uses
      // react-native-screens' native UINavigationController / FragmentManager).
      // Pushes back/forward animate without ever crossing the JS bridge.
      animation: 'simple_push' as const,
    }),
    [theme.bg],
  );

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style="light" />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(auth)"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="category/[id]"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="theme-pack/[id]"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="search"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="wallpapers/2d-kawaii"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="wallpapers/dual"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="wallpapers/theme-packs"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="mood/camera"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="mood/pick-collection"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="mood/pool/[id]"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="ai/preview"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="mood/[id]"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="mood/history"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="shuffle/[id]"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="shuffle/active"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="shuffle/history"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="couple/setup"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="couple/linking"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="couple/dashboard"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="couple/preview"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="favorites"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="wallpaper/edit"
          options={{ animation: 'simple_push' }}
        />
        <Stack.Screen
          name="wallpaper/[id]"
          options={{ presentation: 'transparentModal', animation: 'fade', animationDuration: 140 }}
        />
      </Stack>
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  // Wire the background task + daily notification handler exactly once.
  // Idempotent — safe across Fast Refresh.
  useEffect(() => {
    bootstrapMoodFeature();
    // Rehydrate Supabase session from AsyncStorage and subscribe to
    // auth-state changes so signOut/signIn anywhere in the app updates
    // the store. Idempotent (bootstrap() guards against double-init).
    void useAuthStore.getState().bootstrap();
    // Couple Proximity feature — fetches the user's active couple,
    // opens the realtime channel, starts the background location task
    // when linked. Idempotent. Must run AFTER auth.bootstrap so it sees
    // the session on the first call.
    void bootstrapCoupleFeature();
    // AI store hydrates the persisted hfToken / provider id / history
    // so the AI tab can immediately reflect them on first render.
    void hydrateAIStore();
    // Favorites hydrate from AsyncStorage so the My Favorites screen +
    // grid hearts survive a cold launch.
    void hydrateFavoritesStore();
    // Settings hydrate directly here (CORE-5) — NOT as a side effect of mood
    // bootstrap awaiting it. ThemeProvider reads `theme` at first paint, so
    // hydrating it on the same tick as everything else avoids a default-theme
    // flash and keeps theme/isPremium/isCouplePremium persisting even if mood
    // bootstrap is ever disabled.
    void hydrateSettingsStore();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      {/* `initialMetrics` gives every SafeAreaView the cached top/bottom
          insets immediately on first paint — without this, every screen
          remounts the safe-area chrome once measurement comes back from
          native, causing a one-frame layout flicker on every push. */}
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <ThemeProvider>
          <BottomSheetModalProvider>
            {/* Headless — drives the auto-shuffle ticker regardless of route. */}
            <ShuffleEngineHost />
            {/* Camera-based Mood Mode is intentionally DISABLED in this build
                (changes/039). The Vivo OriginOS PreviewView refused to allocate
                a real Surface for the hidden CameraView in every positioning
                strategy we tried (1×1 / off-screen / clipped / covered) —
                takePictureAsync threw 'no image data'. Per user direction
                we're shipping without the camera path while keeping the
                MoodEngineHost code on disk so a future build with a different
                camera library (vision-camera, ml-kit) can re-enable it.
              <MoodEngineHost />
            */}
            {/* Singleton host for `premiumAlert(...)` — replaces native
                Alert.alert across the app with the bottom-sheet design. */}
            <PremiumAlertHost />
            {/* Catch any uncaught render throw below the root so we show a
                themed recovery screen instead of a blank white screen in
                release / red-box in dev (CORE-4). */}
            <ErrorBoundary>
              <RootStack />
            </ErrorBoundary>
          </BottomSheetModalProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
});
