import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { SimpleButton } from '../../components/SimpleButton';
import {
  type CoupleRole,
  getCouplePack,
  soloImageForRole,
} from '../../constants/couplePacks';
import { Colors, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { setMyCoupleRole } from '../../lib/couple';
import { toast } from '../../lib/toast';
import {
  useCoupleLink,
  useCouplePackId,
  useCoupleProximity,
} from '../../store/couple';
import { styles } from '../../components/couplePreview/styles';

/**
 * Couple Preview — the "pick your side" screen.
 *
 * Reached by tapping a pack on the Couple tab (with `?packId=…`). Shows the
 * together image (both halves combined) as the hero, then the two solo
 * halves — Boy / Girl — as selectable cards. Each partner taps the half
 * that's theirs, then continues to pairing carrying the pack + chosen role.
 *
 * When the user is already linked (reached via the dashboard's eye button,
 * no `packId`), it falls back to the active pack and the user's own role,
 * and shows the live proximity status instead of the pairing CTA.
 */
export default function CouplePreview() {
  const router = useRouter();
  const theme = useTheme();
  const link = useCoupleLink();
  const proximity = useCoupleProximity();
  const activePackId = useCouplePackId();
  const params = useLocalSearchParams<{ packId?: string }>();

  // Pack: from the tapped card, else the active linked pack, else first.
  const pack = useMemo(
    () => getCouplePack(params.packId ?? activePackId ?? null),
    [params.packId, activePackId],
  );

  const isLinked = link?.status === 'linked';
  // Pre-select the user's own side when linked; default to Boy otherwise.
  const [role, setRole] = useState<CoupleRole>(link?.myRole ?? 'a');

  const { width } = useWindowDimensions();
  const heroW = width - Spacing.lg * 2;
  const heroH = Math.round(heroW * 0.82);
  const soloW = Math.floor((width - Spacing.lg * 2 - Spacing.md) / 2);
  const soloH = Math.round(soloW * 1.5);

  const onContinue = () => {
    router.push(`/couple/setup?packId=${pack.id}&role=${role}` as Href);
  };

  // Tap a side. Before linking it's just the local pick carried to setup.
  // After linking it PERSISTS immediately — swapping the partner to the other
  // half (roles must stay opposite) and re-applying the wallpaper.
  const onPickSide = async (value: CoupleRole) => {
    setRole(value); // instant highlight either way
    if (!isLinked || value === link?.myRole) return;
    const res = await setMyCoupleRole(value);
    if (!res.ok) {
      toast(res.error ?? 'Could not change side');
      return;
    }
    toast(`✓ You're now ${value === 'a' ? pack.roleALabel : pack.roleBLabel}`);
  };

  const roles: { value: CoupleRole; label: string; emoji?: string; image: number | string }[] = [
    { value: 'a', label: pack.roleALabel, emoji: pack.roleAEmoji, image: soloImageForRole(pack, 'a') },
    { value: 'b', label: pack.roleBLabel, emoji: pack.roleBEmoji, image: soloImageForRole(pack, 'b') },
  ];

  const chosenLabel = role === 'a' ? pack.roleALabel : pack.roleBLabel;
  const isNear = proximity === 'near';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>{pack.name}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Together hero ── */}
        <View style={[styles.hero, { width: heroW, height: heroH, borderColor: pack.accent + '66', shadowColor: pack.accent }]}>
          <Image
            source={pack.togetherImage}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={160}
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.8)']}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={[styles.heroPill, { backgroundColor: theme.primary }]}>
            <Ionicons name="heart" size={12} color="#131313" />
            <Text style={styles.heroPillText}>Together</Text>
          </View>
          <View style={styles.heroFooter}>
            <Text style={styles.heroTitle}>The complete moment</Text>
            <Text style={styles.heroSub}>
              Both phones show this when you're close. {pack.blurb}
            </Text>
          </View>
        </View>

        {/* ── Pick your side ── */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {isLinked ? 'Your side' : 'Pick your side'}
          </Text>
          <Text style={styles.sectionSub}>
            When you're apart, your phone shows your half — your partner's
            shows theirs. The two complete the picture above.
          </Text>
        </View>

        <View style={styles.soloRow}>
          {roles.map((r) => {
            const selected = r.value === role;
            return (
              <SimpleButton
                key={r.value}
                onPress={() => onPickSide(r.value)}
                style={[
                  styles.soloCard,
                  { width: soloW, height: soloH },
                  selected && { borderColor: pack.accent, borderWidth: 2.5 },
                ]}
              >
                <Image
                  source={r.image}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={140}
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.05)', 'rgba(0,0,0,0.82)']}
                  locations={[0, 0.5, 1]}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                {selected ? (
                  <View style={[styles.check, { backgroundColor: pack.accent }]}>
                    <Ionicons name="checkmark" size={14} color="#131313" />
                  </View>
                ) : null}
                <View style={styles.soloFooter}>
                  <Text style={styles.soloLabel}>
                    {r.emoji ?? ''} {r.label}
                  </Text>
                  <Text style={styles.soloHint}>
                    {selected ? '✓ This is me' : 'Tap to choose'}
                  </Text>
                </View>
              </SimpleButton>
            );
          })}
        </View>

        {/* ── Action ── */}
        {isLinked ? (
          <View style={styles.statusWrap}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isNear ? theme.primary : Colors.cyan },
              ]}
            />
            <Text style={[styles.statusText, { color: theme.text }]}>
              On your phone now:{' '}
              <Text style={{ fontWeight: '800' }}>
                {isNear ? 'Together image' : `${chosenLabel} half`}
              </Text>
            </Text>
          </View>
        ) : null}

        <AnimatedButton
          onPress={isLinked ? () => router.push('/couple/dashboard' as Href) : onContinue}
          style={[styles.cta, { backgroundColor: theme.primary }]}
        >
          <Ionicons
            name={isLinked ? 'sparkles' : 'heart'}
            size={16}
            color="#131313"
          />
          <Text style={styles.ctaText}>
            {isLinked
              ? 'Open couple dashboard'
              : `Pair as ${chosenLabel} →`}
          </Text>
        </AnimatedButton>

        {!isLinked ? (
          <Text style={styles.footnote}>
            Pairing uses a couple code: one of you subscribes and gets the
            code, the other pastes it — then this pack unlocks for you both.
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
