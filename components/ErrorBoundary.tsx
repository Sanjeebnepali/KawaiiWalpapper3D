import { Ionicons } from '@expo/vector-icons';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '../constants/theme';

/**
 * App-wide React error boundary (CORE-4).
 *
 * Without this, any uncaught render throw unwinds all the way to the root and
 * leaves the user staring at a red-box (dev) or a blank white screen
 * (release) with no way out. This catches the throw, logs it, and renders a
 * themed fallback with a "Try again" affordance that clears the error state
 * and re-mounts the subtree — the cheapest in-app recovery short of a full
 * native reload.
 *
 * It MUST be a class component: `getDerivedStateFromError` /
 * `componentDidCatch` have no hooks equivalent. That also means it can't read
 * `useTheme()`, so the fallback uses the static `Colors` tokens — the safe
 * choice anyway, since the theme context may itself be part of whatever threw.
 */

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    // Move to the fallback UI on the next render.
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface in Metro / logcat so the crash is recoverable from the logs even
    // though the red-box is suppressed by the boundary.
    console.error('[ErrorBoundary] uncaught render error:', error, info.componentStack);
  }

  private handleReset = () => {
    // Clear the captured error so the children re-mount and re-attempt render.
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.glyph}>
          <Ionicons name="sad-outline" size={30} color={Colors.pink} />
        </View>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.sub}>
          The screen ran into an unexpected error. You can try again — your
          saved wallpapers and settings are safe.
        </Text>
        {/* Dev-only detail so we can see what threw without leaving the app. */}
        {__DEV__ && this.state.error.message ? (
          <Text style={styles.detail} numberOfLines={4}>
            {this.state.error.message}
          </Text>
        ) : null}
        <Pressable
          onPress={this.handleReset}
          hitSlop={8}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="refresh" size={16} color="#131313" />
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  glyph: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.pinkDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  title: {
    color: Colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sub: {
    color: Colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  detail: {
    color: Colors.textMute,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.pink,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  btnText: { color: '#131313', fontSize: 14, fontWeight: '800' },
});
