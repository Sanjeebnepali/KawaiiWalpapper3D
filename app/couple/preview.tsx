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
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  useCoupleLink,
  useCouplePackId,
  useCoupleProximity,
} from '../../store/couple';

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
                onPress={() => setRole(r.value)}
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    flex: 1,
    textAlign: 'center',
  },
  body: { paddingHorizontal: Spacing.lg, paddingBottom: 40, gap: Spacing.lg },
  hero: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: Colors.surface,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroPill: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  heroPillText: { fontSize: 11, fontWeight: '800', color: '#131313', letterSpacing: 0.3 },
  heroFooter: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  heroTitle: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 17, marginTop: 3 },
  sectionHead: { gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  sectionSub: { color: Colors.textDim, fontSize: 12, lineHeight: 17 },
  soloRow: { flexDirection: 'row', gap: Spacing.md },
  soloCard: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soloFooter: { position: 'absolute', left: 10, right: 10, bottom: 10 },
  soloLabel: { color: '#fff', fontSize: 15, fontWeight: '800' },
  soloHint: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  statusWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 13 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: Radius.pill,
  },
  ctaText: { fontSize: 15, fontWeight: '800', color: '#131313' },
  footnote: {
    color: Colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
