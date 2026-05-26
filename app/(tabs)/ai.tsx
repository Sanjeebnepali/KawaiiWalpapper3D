import { Ionicons } from '@expo/vector-icons';
import { type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { AspectChips } from '../../components/aiGenerator/AspectChips';
import { ModerationAlert } from '../../components/aiGenerator/ModerationAlert';
import { QuickStarts } from '../../components/aiGenerator/QuickStarts';
import { RecentStrip } from '../../components/aiGenerator/RecentStrip';
import { styles } from '../../components/aiGenerator/styles';
import { TokenHint } from '../../components/aiGenerator/TokenHint';
import { Colors } from '../../constants/theme';
import { useAiGenerator } from '../../hooks/useAiGenerator';
import {
  FREE_DAILY_LIMIT,
  hasUnlimitedGeneration,
} from '../../lib/ai/client';

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
  const {
    theme,
    router,
    insets,
    history,
    todayCount,
    provider,
    prompt,
    setPrompt,
    aspect,
    setAspect,
    busy,
    checking,
    moderation,
    dismissModeration,
    onSurpriseMe,
    onCancel,
    onDeleteHistoryItem,
    onOpenHistoryItem,
    onGenerate,
  } = useAiGenerator();

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
              {provider.displayName} ·{' '}
              {hasUnlimitedGeneration()
                ? 'unlimited (your key)'
                : `${todayCount()} / ${FREE_DAILY_LIMIT} today`}
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

            <AspectChips aspect={aspect} setAspect={setAspect} busy={busy} />

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
                  <Text style={[styles.generateText, { color: theme.text }]}>
                    {checking ? 'Reviewing…' : 'Cancel'}
                  </Text>
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
            <TokenHint
              provider={provider}
              onPress={() => router.push('/(tabs)/profile' as Href)}
            />
          ) : null}

          <QuickStarts setPrompt={setPrompt} busy={busy} />

          {/* Recent generations strip */}
          {history.length > 0 ? (
            <RecentStrip
              history={history}
              onOpen={onOpenHistoryItem}
              onDelete={onDeleteHistoryItem}
            />
          ) : null}

          {/* Tail spacer — extra breathing room at the end of the scroll
              so the user can pull the last section up off the tab bar
              and the page never feels "stuck at the bottom". */}
          <View style={styles.tailSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Content-moderation alert — shown when a prompt is blocked by the
          prohibited-content gate (change 172). Renders as a Modal so it
          floats above the screen + tab bar. */}
      <ModerationAlert verdict={moderation} onDismiss={dismissModeration} />
    </SafeAreaView>
  );
}
