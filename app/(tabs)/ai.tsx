import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useRequireAuth } from '../../hooks/useRequireAuth';
import { deleteGeneration, generateImage } from '../../lib/ai/client';
import { getProvider } from '../../lib/ai/registry';
import type { AspectRatio } from '../../lib/ai/types';
import { toast } from '../../lib/toast';
import { hydrateAIStore, useAIStore } from '../../store/ai';

const SUGGESTIONS = [
  'Kawaii baby astronaut floating in pastel space, soft cotton candy clouds',
  'Coquette bunny princess in lace dress, dreamy garden, fairy lights',
  'Neon cyber kitten on a Tokyo rooftop at night, holographic billboards',
  'Marble cherub with golden wings, baroque clouds, soft sun rays',
];

const ASPECTS: { id: AspectRatio; label: string }[] = [
  { id: '9:16', label: 'Phone' },
  { id: '1:1', label: 'Square' },
  { id: '3:4', label: 'Portrait' },
  { id: '16:9', label: 'Wide' },
];

/**
 * AI Generator — prompt entry, provider/aspect chips, Generate button,
 * inline loading state, recent generations strip.
 *
 * The generate call routes through `lib/ai/client.generateImage`, which
 * dispatches to whichever provider id is active in `useAIStore`. The
 * screen itself never knows which provider is doing the work — that's
 * the whole point of the abstraction. To add DALL-E later, drop a file
 * in `lib/ai/providers/` and register it; this screen needs ZERO edits.
 *
 * On success the screen routes to `/ai/preview` which owns the
 * save/set/add-to-pool buttons. The image URI is passed via search
 * params so the preview survives a re-mount.
 */
export default function AIGenerator() {
  const theme = useTheme();
  const router = useRouter();
  const { requireAuth } = useRequireAuth();
  // Bottom-inset for the scroll's paddingBottom so the last section
  // clears the bottom tab bar + OS gesture pill, AND so there's always
  // a few hundred extra px of scrollable room — the user reported the
  // page "feels stack[ed], can't scroll although it fits". A taller
  // contentContainer means the ScrollView is genuinely scrollable on
  // every screen size, not just the small ones.
  const insets = useSafeAreaInsets();

  const hydrated = useAIStore((s) => s.hydrated);
  const providerId = useAIStore((s) => s.providerId);
  const history = useAIStore((s) => s.history);
  const todayCount = useAIStore((s) => s.todayCount);

  const provider = useMemo(() => getProvider(providerId), [providerId]);

  // "Retry with this prompt" from the preview screen forwards the prompt
  // via a router param. Read it here and seed the input once (AI-2) —
  // previously the param was sent but never consumed, so retry landed
  // on an empty box.
  const { prompt: promptParam } = useLocalSearchParams<{ prompt?: string }>();

  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState<AspectRatio>('9:16');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous in-flight guard (AI-1). `busy` is async React state, so
  // two taps in the same tick both pass `if (busy) return` before
  // `setBusy(true)` lands — firing two concurrent generations. This ref
  // flips synchronously so the second tap is rejected immediately.
  const inFlightRef = useRef(false);
  // Holds the `model_loading` auto-retry timer so we can clear it on
  // unmount and never stack overlapping retries (AI-6).
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hydrated) hydrateAIStore();
  }, [hydrated]);

  // Seed the prompt box from the forwarded retry param, once, only when
  // it's a non-empty string (AI-2). We don't add `prompt` to the deps —
  // this is a one-shot seed on param arrival, not a two-way bind.
  useEffect(() => {
    if (typeof promptParam === 'string' && promptParam.length > 0) {
      setPrompt(promptParam);
    }
  }, [promptParam]);

  // Cancel any in-flight generation if the screen unmounts (e.g. user
  // switches tabs). Prevents the success path from trying to navigate
  // on a dead screen. Also clear any pending model_loading retry timer
  // (AI-6) so it can't fire the handler after the screen is gone.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const onSurpriseMe = useCallback(() => {
    const pick = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
    setPrompt(pick);
  }, []);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // Release the synchronous in-flight guard (AI-1) so the user can
    // immediately fire a fresh generation after cancelling.
    inFlightRef.current = false;
    setBusy(false);
  }, []);

  // Long-press on a recent-generation thumb → confirm → delete.
  // Same delete pipeline as the preview screen's Discard button (the
  // `deleteGeneration` helper handles history + pool refs + cache
  // file together). The recent strip auto-updates because it reads
  // from `useAIStore(s => s.history)` — store change triggers
  // re-render.
  const onDeleteHistoryItem = useCallback((localUri: string) => {
    premiumAlert({
      title: 'Delete this image?',
      message:
        'Removes it from history, from any mood pool it was added to, and deletes the file.',
      icon: 'trash-outline',
      accentColor: Colors.error,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            void deleteGeneration(localUri).then((r) => {
              if (r.removedFromPools > 0) {
                toast(
                  `Deleted · also removed from ${r.removedFromPools} pool${
                    r.removedFromPools === 1 ? '' : 's'
                  }`,
                );
              } else {
                toast('Deleted');
              }
            });
          },
        },
      ],
    });
  }, []);

  const onGenerate = useCallback(() => {
    requireAuth(
      async () => {
        // Synchronous in-flight guard (AI-1) — must be the very first
        // thing in the async body so two taps in the same tick can't
        // both get past it. The old `if (busy) return` check raced
        // because `setBusy(true)` lands async; this ref flips
        // synchronously. Cleared in the `finally` and in `onCancel`.
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          // Pre-flight: provider needs a token. Surface the Settings
          // shortcut so the user can paste their HF token without
          // hunting through the tree.
          if (!provider.isConfigured()) {
            premiumAlert({
              title: 'Add your AI token',
              message:
                `${provider.displayName} needs an API token before it can generate. Open Settings → AI to paste yours.`,
              icon: 'key-outline',
              buttons: [
                { text: 'Not now', style: 'cancel' },
                {
                  text: 'Open Settings',
                  onPress: () => router.push('/(tabs)/profile' as Href),
                },
              ],
            });
            return;
          }
          const trimmed = prompt.trim();
          if (!trimmed) {
            toast('Type a prompt first');
            return;
          }

          const ctrl = new AbortController();
          abortRef.current = ctrl;
          setBusy(true);
          const r = await generateImage({ prompt: trimmed, aspect }, ctrl.signal);
          // If the user cancelled, the abort path (onCancel) already
          // reset busy/guard; bail without touching state. busy/abortRef
          // are reset in the finally regardless (AI-5).
          if (ctrl.signal.aborted) return;

          if (r.ok) {
            // Route to preview — the URI doubles as the preview's
            // identifier so a refresh / back-and-forward keeps working.
            // `fresh: '1'` marks this as a brand-new generation so the
            // preview auto-saves it exactly once (AI-4) — re-opens from
            // the recent strip omit the flag.
            router.push({
              pathname: '/ai/preview' as Href,
              params: {
                uri: r.localUri,
                prompt: trimmed,
                model: r.model,
                durationMs: String(r.durationMs),
                fresh: '1',
              },
            });
          } else {
            // model_loading is the most common first-call error — give
            // the user a one-tap retry rather than a flat toast.
            if (r.reason === 'model_loading' && r.retryAfterMs) {
              premiumAlert({
                title: 'Model is waking up',
                message: r.message,
                icon: 'time-outline',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: `Retry in ${Math.ceil(r.retryAfterMs / 1000)}s`,
                    onPress: () => {
                      // Store the timer so unmount can cancel it, and
                      // clear any prior one so retries never stack (AI-6).
                      // The retry re-enters onGenerate, which re-checks
                      // the in-flight guard (already released by the
                      // finally that ran when this invocation returned).
                      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                      retryTimerRef.current = setTimeout(() => {
                        retryTimerRef.current = null;
                        onGenerate();
                      }, r.retryAfterMs);
                    },
                  },
                ],
              });
              return;
            }
            if (r.reason === 'auth_missing' || r.reason === 'auth_invalid') {
              // 403 / 401 alerts cover three real-world causes (per
              // changes/066): (a) token missing the "Inference Providers"
              // permission, (b) gated model, (c) out of credits. Cases
              // (a) and (b) need the user to fix something on
              // huggingface.co — NOT in our app's Settings. So we now
              // offer two distinct buttons:
              //   - "Edit at HF" → browser link to the relevant HF page
              //   - "Open Settings" → app Settings (for case c: paste
              //                       a different token)
              // The HF target URL is picked off the message text — if
              // we mentioned a specific model page, link there; else
              // the tokens dashboard.
              const modelMentioned = /huggingface\.co\/([^\s)]+)/i.exec(r.message);
              const hfUrl = modelMentioned
                ? `https://huggingface.co/${modelMentioned[1].replace(/[).,]+$/, '')}`
                : 'https://huggingface.co/settings/tokens';
              premiumAlert({
                title: 'Token issue',
                message: r.message,
                icon: 'key-outline',
                buttons: [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Edit at HF',
                    onPress: () => {
                      void Linking.openURL(hfUrl).catch(() => {
                        toast('Couldn’t open the browser');
                      });
                    },
                  },
                  {
                    text: 'Open Settings',
                    onPress: () => router.push('/(tabs)/profile' as Href),
                  },
                ],
              });
              return;
            }
            toast(r.message);
          }
        } finally {
          // Reset transient UI state on EVERY exit path (AI-1 + AI-5):
          // success push, validation bail, error alert, or an abort
          // racing the provider resolution. Putting it here means the
          // Generate button can never get stuck on "Cancel" and a fresh
          // tap is always accepted.
          inFlightRef.current = false;
          abortRef.current = null;
          setBusy(false);
        }
      },
      {
        title: 'Sign in to generate',
        message: 'AI generations are linked to your account so we can track your daily quota.',
      },
    );
  }, [aspect, prompt, provider, requireAuth, router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            // Tail padding = tab bar clearance (120) + the OS gesture /
            // 3-button nav inset. Combined with the in-tree
            // <tailSpacer/> below, this guarantees the page is always
            // scrollable even on tall devices, so the user no longer
            // gets the "stuck" feel they reported.
            { paddingBottom: 120 + insets.bottom },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          // iOS: rubber-band bounce even when content fits the viewport,
          // so the screen always feels "alive" on a pull-down.
          alwaysBounceVertical
          bounces
          // Android: show the overscroll glow on both edges even when
          // content fits — the cheapest UX hint that "this screen has
          // depth, you can scroll."
          overScrollMode="always"
          // Smoother decel on flick — matches iOS feel on Android.
          decelerationRate="normal"
        >
          <Animated.View entering={FadeInDown.delay(40).springify().damping(18)} style={styles.head}>
            <Text style={styles.eyebrow}>AI GENERATOR</Text>
            <Text style={[styles.title, { color: theme.text }]}>Make a wallpaper</Text>
            <Text style={styles.sub}>
              {provider.displayName} · {todayCount()} generated today
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(110).springify().damping(18)}
            style={[styles.promptBox, { borderColor: Colors.border }]}
          >
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="e.g. grumpy toddler with arms crossed, pastel rain, cinematic light"
              placeholderTextColor={Colors.textMute}
              style={[styles.input, { color: theme.text }]}
              multiline
              editable={!busy}
            />

            {/* Aspect chip row */}
            <View style={styles.aspectRow}>
              {ASPECTS.map((a) => {
                const active = a.id === aspect;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => setAspect(a.id)}
                    style={[
                      styles.aspectChip,
                      active && { backgroundColor: theme.primary, borderColor: theme.primary },
                    ]}
                    disabled={busy}
                  >
                    <Text
                      style={[
                        styles.aspectText,
                        active && { color: '#131313' },
                      ]}
                    >
                      {a.label} · {a.id}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.promptFoot}>
              <Pressable style={styles.dice} onPress={onSurpriseMe} disabled={busy}>
                <Ionicons name="dice-outline" size={16} color={Colors.textDim} />
                <Text style={styles.diceText}>Surprise me</Text>
              </Pressable>
              {busy ? (
                <AnimatedButton
                  onPress={onCancel}
                  style={[styles.generate, { backgroundColor: Colors.surface, borderColor: Colors.border, borderWidth: 1 }]}
                >
                  <ActivityIndicator size="small" color={theme.primary} />
                  <Text style={[styles.generateText, { color: theme.text }]}>Cancel</Text>
                </AnimatedButton>
              ) : (
                <AnimatedButton
                  onPress={onGenerate}
                  style={[styles.generate, { backgroundColor: theme.primary, shadowColor: theme.primary }]}
                >
                  <Ionicons name="sparkles" size={14} color="#131313" />
                  <Text style={styles.generateText}>Generate</Text>
                </AnimatedButton>
              )}
            </View>
          </Animated.View>

          {/* Token state hint */}
          {!provider.isConfigured() ? (
            <Animated.View entering={FadeInDown.delay(170).springify().damping(18)}>
              <Pressable
                onPress={() => router.push('/(tabs)/profile' as Href)}
                style={styles.tokenHint}
              >
                <Ionicons name="key-outline" size={14} color={Colors.gold} />
                <Text style={styles.tokenHintText}>
                  No {provider.displayName} token yet — tap to add in Settings.
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          {/* Quick starts */}
          <Animated.View entering={FadeInDown.delay(220).springify().damping(18)}>
            <Text style={styles.section}>Quick starts</Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  style={styles.chip}
                  onPress={() => setPrompt(s)}
                  disabled={busy}
                >
                  <Text style={styles.chipText} numberOfLines={2}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* Recent generations strip */}
          {history.length > 0 ? (
            <Animated.View entering={FadeInDown.delay(290).springify().damping(18)}>
              <View style={styles.recentHead}>
                <Text style={styles.section}>Recent generations</Text>
                <Text style={styles.recentHint}>Long-press to delete</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.recentRow}
                alwaysBounceHorizontal
                overScrollMode="always"
                decelerationRate="normal"
              >
                {history.slice(0, 10).map((g) => (
                  <Pressable
                    key={g.localUri}
                    onPress={() =>
                      router.push({
                        pathname: '/ai/preview' as Href,
                        params: {
                          uri: g.localUri,
                          prompt: g.prompt,
                          model: g.model,
                          // Use the persisted timing (AI-7); older
                          // history entries without it fall back to 0,
                          // which the preview renders as "no timing".
                          durationMs: String(g.durationMs ?? 0),
                          // No `fresh` flag — re-opens must not re-save
                          // (AI-4).
                        },
                      })
                    }
                    onLongPress={() => onDeleteHistoryItem(g.localUri)}
                    delayLongPress={350}
                    style={styles.recentCell}
                  >
                    <Image
                      source={{ uri: g.localUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={80}
                      cachePolicy="memory-disk"
                    />
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          ) : null}

          {/* Tail spacer — extra breathing room at the end of the scroll
              so the user can pull the last section up off the tab bar
              and the page never feels "stuck at the bottom". */}
          <View style={styles.tailSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  // Wider gap (Spacing.lg → Spacing.xl) so the four sections
  // (head / prompt / quick starts / recent) read as distinct cards
  // rather than one stacked block. paddingBottom is overridden inline
  // with the safe-area inset, but the StyleSheet entry still sets a
  // sane fallback for the rare case where useSafeAreaInsets() hasn't
  // resolved yet.
  scroll: { padding: Spacing.lg, gap: Spacing.xl, paddingBottom: 200 },
  head: { gap: 4, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  eyebrow: { color: Colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: Colors.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
  sub: { color: Colors.textDim, fontSize: 12, fontWeight: '700' },

  promptBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: Radius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  input: {
    fontSize: 15,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  aspectRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  aspectChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Colors.bgAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  aspectText: {
    color: Colors.textDim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  promptFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  diceText: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
  generate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  generateText: { color: '#131313', fontWeight: '800', fontSize: 13 },

  tokenHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(252,211,77,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(252,211,77,0.35)',
  },
  tokenHintText: { color: Colors.gold, fontSize: 12, fontWeight: '700' },

  section: { color: Colors.textDim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    borderRadius: Radius.lg,
    maxWidth: '100%',
  },
  chipText: { color: Colors.text, fontSize: 12, fontWeight: '600' },

  recentHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recentHint: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  recentRow: { gap: Spacing.sm, paddingRight: Spacing.lg, paddingTop: Spacing.sm },
  recentCell: {
    width: 90,
    height: 140,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  // Empty bottom block that guarantees the ScrollView always has more
  // height than the viewport, so it's always genuinely scrollable
  // (not just bouncy). Combined with `alwaysBounceVertical` + Android
  // `overScrollMode="always"` this makes the screen feel "flowy"
  // even when the four real sections fit on a tall device.
  tailSpacer: { height: 120 },
});
