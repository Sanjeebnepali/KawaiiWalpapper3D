import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { COLLECTION_SIZE } from '../../constants/shuffle';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { deleteGeneration } from '../../lib/ai/client';
import { toast } from '../../lib/toast';
import { saveToGallery, setAsWallpaper } from '../../lib/wallpaperActions';
import { useMoodStore } from '../../store/mood';
import { useSettingsStore } from '../../store/settings';
import { useShuffleStore } from '../../store/shuffle';

/**
 * AI generation preview — full-screen image + action row.
 *
 * Mirrors the wallpaper-preview UX users already know from
 * `app/wallpaper/[id].tsx`: big image, soft fade overlay, action buttons
 * at the bottom. Differs in the action set — AI generations are ephemeral
 * by default (live only in cacheDirectory), so the user has to explicitly
 * decide what to do with them: save / set / add to mood pool / discard.
 *
 * The image URI is passed via search params so this screen has zero
 * dependence on the AI store; it works for ANY local file:// URI (e.g.
 * "view a previous generation from the recent strip").
 */
export default function AIPreview() {
  const router = useRouter();
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  // Bottom-inset for the action bar — same problem the mood pool
  // footer had (changes/065): static paddingBottom puts the buttons
  // behind the OS gesture pill / 3-button nav on Vivo / MIUI. Read
  // the inset and apply it inline below. Top is owned by SafeAreaView
  // edges={['top']}.
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    prompt?: string;
    model?: string;
    durationMs?: string;
    fresh?: string;
  }>();

  const uri = typeof params.uri === 'string' ? params.uri : '';
  const prompt = typeof params.prompt === 'string' ? params.prompt : '';
  const model = typeof params.model === 'string' ? params.model : '';
  const durationMs = Number(params.durationMs ?? 0);
  // `fresh === '1'` is set only by the AI tab's success push — i.e. this
  // is a brand-new generation. Re-opening a past generation from the
  // recent strip omits the flag, so auto-save skips it (AI-4) and we
  // don't write a duplicate `ai-${Date.now()}` gallery copy each visit.
  const isFresh = params.fresh === '1';

  const featuredFolder = useSettingsStore((s) => s.featuredFolder);
  const autoSaveGenerated = useSettingsStore((s) => s.autoSaveGenerated);
  const moodCollectionId = useMoodStore((s) => s.moodCollectionId);
  const collections = useShuffleStore((s) => s.collections);
  const updateCollection = useShuffleStore((s) => s.updateCollection);

  const [busyAction, setBusyAction] = useState<
    null | 'save' | 'set' | 'pool'
  >(null);
  // Guard so the auto-save-on-arrive effect only runs once per
  // generation. Otherwise a focus event / re-render would save twice.
  const autoSavedRef = useRef(false);

  // Sized so the preview leaves room for header + prompt block + action
  // bar in the visible viewport on a typical 360×800 dp phone, no
  // scrolling needed. Previously 0.72 (576 dp) which left only
  // ~200 dp for everything else and forced the prompt block off-screen.
  const imageH = Math.min(height * 0.55, width * 1.5);

  const onSave = useCallback(async () => {
    if (!uri) return;
    setBusyAction('save');
    const r = await saveToGallery(uri, `ai-${Date.now()}`, featuredFolder);
    setBusyAction(null);
    toast(r.message);
  }, [uri, featuredFolder]);

  // Settings → "Save Generated Images Automatically" makes the preview
  // screen save the result to the gallery the moment it lands, so the
  // user doesn't have to tap Save manually for every generation. Runs
  // once per uri (the ref guards against re-fires from focus/re-render).
  useEffect(() => {
    if (!autoSaveGenerated) return;
    if (!uri) return;
    // Only auto-save fresh generations — re-opening a past generation
    // from the recent strip must NOT re-save a duplicate (AI-4).
    if (!isFresh) return;
    if (autoSavedRef.current) return;
    autoSavedRef.current = true;
    void saveToGallery(uri, `ai-${Date.now()}`, featuredFolder).then((r) => {
      if (r.ok) toast(r.message);
    });
  }, [autoSaveGenerated, uri, featuredFolder, isFresh]);

  const onSet = useCallback(() => {
    if (!uri) return;
    premiumAlert({
      title: 'Set as wallpaper',
      message: 'Apply this generation to:',
      icon: 'phone-portrait-outline',
      buttons: [
        {
          text: 'Both screens',
          onPress: () => doSet('both'),
        },
        {
          text: 'Lock only',
          onPress: () => doSet('lock'),
        },
        {
          text: 'Home only',
          onPress: () => doSet('home'),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [uri]);

  const doSet = useCallback(
    async (target: 'both' | 'lock' | 'home') => {
      if (!uri) return;
      setBusyAction('set');
      const r = await setAsWallpaper(uri, `ai-${Date.now()}`, target);
      setBusyAction(null);
      toast(r.message);
    },
    [uri],
  );

  const onAddToMoodPool = useCallback(() => {
    if (!uri) return;
    // Find the user's mood-purpose collection. If none exists, the AI
    // screen can't auto-create one here without going through the
    // gatePremium flow — easier to bounce the user to the pool screen.
    const moodPool = collections.find(
      (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'mood',
    );
    if (!moodPool) {
      premiumAlert({
        title: 'No mood pool yet',
        message: 'Create a mood pool first, then come back to add this image.',
        icon: 'images-outline',
        buttons: [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Create pool',
            onPress: () => router.push('/mood/pick-collection' as Href),
          },
        ],
      });
      return;
    }
    setBusyAction('pool');
    // Append + sliding-window eviction at COLLECTION_SIZE, same pattern
    // as the Custom add-photos flow on the Mood tab.
    const without = moodPool.photoIds.filter((p) => p !== uri);
    const merged = [...without, uri].slice(-COLLECTION_SIZE);
    updateCollection(moodPool.id, { photoIds: merged });
    setBusyAction(null);
    toast(
      moodPool.id === moodCollectionId
        ? '✓ Added to active mood pool'
        : `✓ Added to "${moodPool.name}"`,
    );
  }, [uri, collections, moodCollectionId, updateCollection, router]);

  const onDiscard = useCallback(() => {
    premiumAlert({
      title: 'Delete this image?',
      message:
        'Removes it from history, from any mood pool it was added to, and deletes the file. This can’t be undone.',
      icon: 'trash-outline',
      accentColor: Colors.error,
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            // Fire-and-forget — the result toast confirms what was
            // cleared (pool references in addition to history). Back-
            // nav happens immediately so the user doesn't watch the
            // cache `unlink` complete.
            void deleteGeneration(uri).then((r) => {
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
            router.back();
          },
        },
      ],
    });
  }, [uri, router]);

  const onRetry = useCallback(() => {
    // Pass the prompt back to the AI tab via a router replace so the
    // user lands on the prompt input with their text pre-filled.
    router.replace({
      pathname: '/(tabs)/ai' as Href,
      params: { prompt },
    });
  }, [prompt, router]);

  if (!uri) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color={theme.text} />
          </AnimatedButton>
          <Text style={[styles.title, { color: theme.text }]}>No image</Text>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            The generation link is missing its image URI. Go back and try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            AI generation
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {model.split('/').pop() ?? model}
            {durationMs > 0 ? ` · ${(durationMs / 1000).toFixed(1)}s` : ''}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          // No more absolutely-positioned action bar — the buttons
          // are part of the scroll content now. Only the OS bottom
          // inset + a margin is needed so the bottom of the action
          // grid clears the gesture pill / nav.
          { paddingBottom: insets.bottom + Spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ─── Image card ─────────────────────────────────────────── */}
        <View
          style={[
            styles.imageWrap,
            { height: imageH, backgroundColor: Colors.surfaceHi },
          ]}
        >
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={120}
            cachePolicy="memory-disk"
          />
        </View>

        {/* ─── Prompt card ────────────────────────────────────────── */}
        {prompt ? (
          <View style={styles.promptBlock}>
            <Text style={styles.promptLabel}>PROMPT</Text>
            <Text style={[styles.promptText, { color: theme.text }]}>{prompt}</Text>
          </View>
        ) : null}

        {/* ─── Primary action: Set as Wallpaper ────────────────────
            Full-width hero CTA — the main reason the user came here. */}
        <AnimatedButton
          onPress={onSet}
          style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          disabled={busyAction === 'set'}
        >
          {busyAction === 'set' ? (
            <ActivityIndicator size="small" color="#131313" />
          ) : (
            <Ionicons name="phone-portrait-outline" size={18} color="#131313" />
          )}
          <Text style={styles.primaryBtnText}>Set as Wallpaper</Text>
        </AnimatedButton>

        {/* ─── Secondary actions: Save + Add to pool ──────────────
            Two outlined buttons side by side. Distinct from the
            destructive / tertiary row below. */}
        <View style={styles.secondaryRow}>
          <AnimatedButton
            onPress={onSave}
            style={[styles.secondaryBtn, { borderColor: theme.primary }]}
            disabled={busyAction === 'save'}
          >
            {busyAction === 'save' ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="download-outline" size={16} color={theme.primary} />
            )}
            <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
              Save to Gallery
            </Text>
          </AnimatedButton>
          <AnimatedButton
            onPress={onAddToMoodPool}
            style={[styles.secondaryBtn, { borderColor: theme.primary }]}
            disabled={busyAction === 'pool'}
          >
            {busyAction === 'pool' ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Ionicons name="images-outline" size={16} color={theme.primary} />
            )}
            <Text style={[styles.secondaryBtnText, { color: theme.primary }]}>
              Add to pool
            </Text>
          </AnimatedButton>
        </View>

        {/* ─── Tertiary actions: Retry + Discard ──────────────────
            Lightweight ghost buttons — clearly less prominent than
            the primary/secondary set, but still tappable. */}
        <View style={styles.tertiaryRow}>
          <AnimatedButton onPress={onRetry} style={styles.tertiaryBtn}>
            <Ionicons name="refresh" size={15} color={Colors.textDim} />
            <Text style={[styles.tertiaryBtnText, { color: Colors.textDim }]}>
              Retry with this prompt
            </Text>
          </AnimatedButton>
          <AnimatedButton onPress={onDiscard} style={styles.tertiaryBtn}>
            <Ionicons name="close-circle-outline" size={15} color={Colors.error} />
            <Text style={[styles.tertiaryBtnText, { color: Colors.error }]}>
              Discard
            </Text>
          </AnimatedButton>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },

  scroll: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    // paddingBottom is set inline above as `insets.bottom + Spacing.xl`
    // so the bottom tertiary row clears the OS gesture pill / nav.
  },
  imageWrap: {
    width: '100%',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  promptBlock: {
    // Scroll's `gap: Spacing.lg` already separates sections — no
    // marginTop needed here.
    padding: Spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  promptLabel: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  promptText: { fontSize: 14, fontWeight: '600', marginTop: 4, lineHeight: 19 },

  // ─── Action hierarchy ────────────────────────────────────────────────
  // Primary: the main reason the user came here (set as wallpaper)
  // Secondary: also-useful actions (save, add to pool)
  // Tertiary: navigational / destructive (retry, discard)
  primaryBtn: {
    height: 54,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: {
    color: '#131313',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  tertiaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
  },
  tertiaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tertiaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  emptyText: { color: Colors.textDim, fontSize: 13, textAlign: 'center' },
});
