import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { ModerationCategory, ModerationVerdict } from '../../lib/ai/promptModeration';
import { AnimatedButton } from '../AnimatedButton';

/**
 * Animated alert shown when `moderatePrompt` blocks a generation prompt.
 *
 * Rendered once by the AI Generator screen with the current verdict; a
 * `null` verdict keeps it hidden. It's a transparent `Modal` so it floats
 * above the tab bar, with a blurred backdrop + a spring-in card and a
 * pulsing category icon — a friendly "nope, here's why" rather than a flat
 * toast. The matched term is deliberately NOT shown (it would just teach a
 * user which word to swap).
 */

/** Playful encouragement shown on every blocked prompt — softens the "no"
 *  and nudges the user toward an original idea. (Spelling auto-corrected from
 *  the requested copy.) */
const ENCOURAGEMENT =
  'You are super talented. You are thinking beyond the universe — think like a human 😎🤣';

type Presentation = {
  title: string;
  reason: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Accent for the icon badge + button. Red = safety, gold = conduct,
   *  lavender = IP. All from the theme palette. */
  accent: string;
};

const PRESENTATION: Record<ModerationCategory, Presentation> = {
  child_safety: {
    title: 'We can’t make that',
    reason:
      'Anything that sexualises or endangers children is never allowed — no exceptions. Please keep prompts about cute, wholesome baby characters.',
    icon: 'shield-checkmark',
    accent: Colors.error,
  },
  sexual: {
    title: 'Keep it wholesome',
    reason:
      'Nudity, suggestive or adult content isn’t allowed. This app is all about cute, kid-friendly characters.',
    icon: 'heart-dislike',
    accent: Colors.error,
  },
  hate: {
    title: 'No hateful content',
    reason:
      'Hate symbols, extremist or discriminatory imagery is prohibited. Let’s keep it kind.',
    icon: 'ban',
    accent: Colors.error,
  },
  violence: {
    title: 'No violence or gore',
    reason:
      'Blood, weapons, fighting and other harmful imagery can’t be generated here.',
    icon: 'warning',
    accent: Colors.gold,
  },
  illegal: {
    title: 'We can’t make that',
    reason:
      'Weapons, drugs, explosives or other illegal-activity imagery isn’t allowed.',
    icon: 'alert-circle',
    accent: Colors.gold,
  },
  real_person: {
    title: 'No real people',
    reason:
      'We can’t generate real celebrities, politicians or anyone’s likeness without consent. Try an original character instead.',
    icon: 'person-remove',
    accent: Colors.gold,
  },
  political: {
    title: 'Keep it non-political',
    reason:
      'Political propaganda, election or civic-unrest imagery isn’t allowed here.',
    icon: 'megaphone',
    accent: Colors.gold,
  },
  misinformation: {
    title: 'No misleading content',
    reason:
      'Fake news, manipulated photos or impersonating real organisations can’t be generated.',
    icon: 'newspaper',
    accent: Colors.gold,
  },
  horror: {
    title: 'Too scary for here',
    reason:
      'Horror, gore and genuinely disturbing imagery don’t fit this cute, kid-friendly app. Cute-spooky is fine — true horror isn’t.',
    icon: 'skull',
    accent: Colors.gold,
  },
  intellectual_property: {
    title: 'No copyrighted characters',
    reason:
      'Named characters, brands, logos and famous artwork are off-limits. Describe an ORIGINAL kawaii character instead — e.g. “a cute superhero baby in a red cape”.',
    icon: 'color-wand',
    accent: Colors.lavender,
  },
};

type Props = {
  /** Current blocked verdict, or `null` to stay hidden. */
  verdict: ModerationVerdict | null;
  onDismiss: () => void;
};

export function ModerationAlert({ verdict, onDismiss }: Props) {
  const theme = useTheme();

  // Gentle looped pulse on the icon badge so the alert feels alive.
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.1, { duration: 720, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 720, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const visible = verdict != null && !verdict.allowed && verdict.category != null;
  // `category` is guaranteed by `visible`; default keeps the type happy.
  const p = visible ? PRESENTATION[verdict.category as ModerationCategory] : null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      {p ? (
        <Animated.View entering={FadeIn.duration(160)} style={styles.fill}>
          <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill}>
            <Pressable style={styles.backdrop} onPress={onDismiss}>
              {/* Card wrapper absorbs taps so tapping the card doesn't
                  dismiss; taps on the surrounding backdrop do. */}
              <Pressable style={styles.cardWrap} onPress={() => {}}>
                <Animated.View
                  entering={ZoomIn.springify().damping(15).stiffness(140)}
                  style={[
                    styles.card,
                    { backgroundColor: theme.surface ?? Colors.surface, borderColor: p.accent + '55' },
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.iconBadge,
                      pulseStyle,
                      { backgroundColor: p.accent + '22', borderColor: p.accent + '66' },
                    ]}
                  >
                    <Ionicons name={p.icon} size={30} color={p.accent} />
                  </Animated.View>

                  <Text style={[styles.title, { color: theme.text ?? Colors.text }]}>
                    {p.title}
                  </Text>
                  <Text style={styles.reason}>{p.reason}</Text>

                  <Text style={[styles.encouragement, { color: p.accent }]}>
                    {ENCOURAGEMENT}
                  </Text>

                  <AnimatedButton
                    onPress={onDismiss}
                    style={[styles.button, { backgroundColor: p.accent }]}
                  >
                    <Text style={styles.buttonText}>Got it</Text>
                  </AnimatedButton>
                </Animated.View>
              </Pressable>
            </Pressable>
          </BlurView>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  cardWrap: { width: '100%', maxWidth: 380 },
  card: {
    width: '100%',
    borderRadius: Radius.xxl,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  reason: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textDim,
    textAlign: 'center',
  },
  encouragement: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  button: {
    marginTop: Spacing.xs,
    alignSelf: 'stretch',
    paddingVertical: 14,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    color: '#131313',
  },
});
