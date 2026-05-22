import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchActiveCouple, unlinkCouple } from '../../lib/couple';
import { toast } from '../../lib/toast';
import { useCoupleLink, useCoupleStore } from '../../store/couple';

/**
 * Couple Linking — the "waiting for partner" room.
 *
 * Person A lands here after generating a code. The bootstrap realtime
 * channel for the couple is already open (see `lib/coupleBootstrap.ts`),
 * so when Person B accepts the code, the store flips status → 'linked'
 * and the useEffect below replaces this route with the dashboard.
 *
 * Three primary actions:
 *   - Copy / share the code again
 *   - Cancel (unlink the pending couple and go back)
 */
export default function CoupleLinking() {
  const router = useRouter();
  const theme = useTheme();
  const link = useCoupleLink();

  // Auto-advance when the partner accepts. Realtime in the bootstrap
  // updates the store; here we just observe.
  useEffect(() => {
    if (link?.status === 'linked') {
      router.replace('/couple/dashboard' as Href);
    } else if (link == null) {
      router.replace('/couple/setup' as Href);
    }
  }, [link, router]);

  // Safety-net poll. Realtime SHOULD flip the status the moment the partner
  // accepts, but if the realtime event is delayed or the project's realtime is
  // ever unavailable, poll the server every few seconds so the creator is
  // never stranded here. Pulling a 'linked' row into the store fires the
  // navigation effect above. Runs only while pending; cleaned up on unmount.
  useEffect(() => {
    if (link?.status !== 'pending') return;
    const id = setInterval(async () => {
      const fresh = await fetchActiveCouple();
      if (fresh?.status === 'linked') {
        useCoupleStore.getState().setLink(fresh);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [link?.status]);

  // Subtle pulse on the heart icon while we wait — reanimated worklet.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.15, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const code = link?.code ?? '—';
  const onCopy = useCallback(async () => {
    if (!link) return;
    await Clipboard.setStringAsync(link.code);
    toast('✓ Code copied');
  }, [link]);
  const onShare = useCallback(async () => {
    if (!link) return;
    await Share.share({
      message: `Be my couple on Kawaii Baby Wallpapers 💕\nMy code: ${link.code}`,
    });
  }, [link]);
  const onCancel = useCallback(async () => {
    const r = await unlinkCouple();
    if (!r.ok) {
      toast(r.error ?? 'Could not cancel');
      return;
    }
    toast('Cancelled');
    router.replace('/couple/setup' as Href);
  }, [router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.body}>
        <Animated.View
          style={[styles.heart, { backgroundColor: theme.primary }, pulseStyle]}
        >
          <Ionicons name="heart" size={42} color="#131313" />
        </Animated.View>

        <Text style={[styles.title, { color: theme.text }]}>
          Waiting for your partner…
        </Text>
        <Text style={styles.body2}>
          Share your code below. The moment they enter it, this screen
          jumps to your couple dashboard.
        </Text>

        <View style={[styles.codeCard, { borderColor: theme.primary }]}>
          <Text style={[styles.codeText, { color: theme.primary }]}>
            {code}
          </Text>
          <View style={styles.btnRow}>
            <AnimatedButton
              onPress={onCopy}
              style={[styles.smallBtn, { borderColor: theme.primary }]}
            >
              <Ionicons name="copy-outline" size={14} color={theme.primary} />
              <Text style={[styles.smallBtnText, { color: theme.primary }]}>
                Copy
              </Text>
            </AnimatedButton>
            <AnimatedButton
              onPress={onShare}
              style={[styles.smallBtn, { borderColor: theme.primary }]}
            >
              <Ionicons name="share-outline" size={14} color={theme.primary} />
              <Text style={[styles.smallBtnText, { color: theme.primary }]}>
                Share
              </Text>
            </AnimatedButton>
          </View>
        </View>

        <AnimatedButton onPress={onCancel} style={styles.cancelBtn}>
          <Ionicons name="close" size={14} color={Colors.textDim} />
          <Text style={styles.cancelText}>Cancel</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  heart: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body2: {
    color: Colors.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  codeCard: {
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
    width: '100%',
  },
  codeText: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 5,
    fontVariant: ['tabular-nums'],
  },
  btnRow: { flexDirection: 'row', gap: Spacing.sm },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: Spacing.lg,
  },
  cancelText: { color: Colors.textDim, fontSize: 13, fontWeight: '700' },
});
