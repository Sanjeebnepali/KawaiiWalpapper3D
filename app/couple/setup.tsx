import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { gateCouplePremium } from '../../components/PremiumLock';
import {
  couplePacks,
  type CoupleRole,
  getCouplePack,
} from '../../constants/couplePacks';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  acceptCoupleCode,
  createCoupleCode,
  fetchActiveCouple,
  isWellFormedCode,
  normaliseCode,
} from '../../lib/couple';
import { toast } from '../../lib/toast';
import { useAuthStatus } from '../../store/auth';
import { useCoupleLink, useCoupleStore } from '../../store/couple';
import { useSettingsStore } from '../../store/settings';

/**
 * Couple Setup — generate OR accept, both with role selection.
 *
 * GENERATE flow:
 *   1. Pick a starter pack (horizontal scrollable triptych row).
 *   2. Pick which slot of that pack you want — labels come from the
 *      pack (Boy / Girl / Sun / Moon / Left / Right …).
 *   3. Tap Generate. Gated on Couple Premium.
 *   4. Big code reveal + Copy / Share / Continue → /couple/linking.
 *
 * ACCEPT flow:
 *   1. Enter LOVE-XXXX.
 *   2. Pick which slot you want — defaults to "auto" (server gives
 *      you the opposite of the creator's slot). Override if you'd
 *      rather pick explicitly.
 *   3. Tap Link → toast + route to /couple/dashboard. Couple Premium
 *      auto-unlocks for you (`lib/couple.ts:acceptCoupleCode`).
 */
export default function CoupleSetup() {
  const router = useRouter();
  const theme = useTheme();
  const authStatus = useAuthStatus();
  const isCouplePremium = useSettingsStore((s) => s.isCouplePremium);
  const link = useCoupleLink();

  // Auto-advance to the dashboard the moment we're linked — covers the case
  // where the creator generates a code and STAYS on this screen (instead of
  // tapping "Continue → Waiting room") while the partner accepts. Without this
  // the creator was stranded on Setup even though the link succeeded.
  useEffect(() => {
    if (link?.status === 'linked') {
      router.replace('/couple/dashboard' as Href);
    }
  }, [link?.status, router]);

  // Safety-net poll while we're holding a freshly-generated (pending) code, in
  // case the realtime "partner accepted" event is delayed. Pulling a linked row
  // into the store fires the effect above. Stops once linked / on unmount.
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

  // Carried in from the preview screen: which pack the user tapped and the
  // side (boy/girl) they chose there. Both optional — fall back to the
  // first pack / role 'a' when the screen is opened directly.
  const params = useLocalSearchParams<{ packId?: string; role?: string }>();
  const initialPackId = couplePacks.some((p) => p.id === params.packId)
    ? (params.packId as string)
    : couplePacks[0].id;
  const initialRole: CoupleRole = params.role === 'b' ? 'b' : 'a';

  const [busy, setBusy] = useState<'create' | 'accept' | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [enterInput, setEnterInput] = useState('');

  // GENERATE-side state
  const [chosenPackId, setChosenPackId] = useState<string>(initialPackId);
  const [chosenRole, setChosenRole] = useState<CoupleRole>(initialRole);
  const chosenPack = useMemo(
    () => getCouplePack(chosenPackId),
    [chosenPackId],
  );

  // ACCEPT-side state — null means "let the server pick the opposite"
  const [acceptRole, setAcceptRole] = useState<CoupleRole | null>(null);

  const onGenerate = useCallback(() => {
    if (authStatus !== 'authed') {
      toast('Sign in first to generate a code');
      return;
    }
    gateCouplePremium(async () => {
      setBusy('create');
      try {
        const r = await createCoupleCode(chosenRole, chosenPackId);
        if (!r.ok) {
          toast(r.error);
          return;
        }
        setGeneratedCode(r.code);
      } finally {
        setBusy(null);
      }
    });
  }, [authStatus, chosenRole, chosenPackId]);

  const onCopy = useCallback(async () => {
    if (!generatedCode) return;
    await Clipboard.setStringAsync(generatedCode);
    toast('✓ Code copied');
  }, [generatedCode]);

  const onShare = useCallback(async () => {
    if (!generatedCode) return;
    await Share.share({
      message: `Be my couple on Kawaii Baby Wallpapers 💕\nMy code: ${generatedCode}`,
    });
  }, [generatedCode]);

  const onAccept = useCallback(async () => {
    if (authStatus !== 'authed') {
      toast('Sign in first to link with a partner');
      return;
    }
    const code = normaliseCode(enterInput);
    if (!isWellFormedCode(code)) {
      toast('Code looks like LOVE-XXXX');
      return;
    }
    setBusy('accept');
    try {
      const r = await acceptCoupleCode(code, acceptRole);
      if (!r.ok) {
        toast(r.error);
        return;
      }
      toast('💕 Linked');
      router.replace('/couple/dashboard' as Href);
    } finally {
      setBusy(null);
    }
  }, [authStatus, enterInput, acceptRole, router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>Couple Setup</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* ─── GENERATE CARD ─── */}
        <View
          style={[
            styles.card,
            generatedCode != null && { borderColor: theme.primary },
          ]}
        >
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: theme.primary }]}>
              <Ionicons name="qr-code" size={18} color="#131313" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                I'm Person A — give me a code
              </Text>
              <Text style={styles.cardBody}>
                Pick a starter pack and your side. Couple Premium required
                to generate.
              </Text>
            </View>
          </View>

          {/* PACK PICKER — horizontal scroll of triptychs */}
          {!generatedCode ? (
            <>
              <Text style={styles.sectionLabel}>1. Pick a pack</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.packRow}
              >
                {couplePacks.map((p) => {
                  const selected = p.id === chosenPackId;
                  return (
                    <AnimatedButton
                      key={p.id}
                      onPress={() => setChosenPackId(p.id)}
                      style={[
                        styles.packCard,
                        selected && {
                          borderColor: p.accent,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <View style={styles.packTriptych}>
                        <Image
                          source={p.roleAImage}
                          style={styles.packSolo}
                          contentFit="cover"
                          transition={80}
                        />
                        <Image
                          source={p.togetherImage}
                          style={styles.packTogether}
                          contentFit="cover"
                          transition={80}
                        />
                        <Image
                          source={p.roleBImage}
                          style={styles.packSolo}
                          contentFit="cover"
                          transition={80}
                        />
                      </View>
                      <Text
                        style={[styles.packName, { color: theme.text }]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text style={styles.packBlurb} numberOfLines={2}>
                        {p.blurb}
                      </Text>
                    </AnimatedButton>
                  );
                })}
              </ScrollView>

              {/* ROLE PICKER */}
              <Text style={styles.sectionLabel}>2. Which side are you?</Text>
              <View style={styles.roleRow}>
                {(['a', 'b'] as CoupleRole[]).map((r) => {
                  const selected = r === chosenRole;
                  const label = r === 'a' ? chosenPack.roleALabel : chosenPack.roleBLabel;
                  const emoji = r === 'a' ? chosenPack.roleAEmoji : chosenPack.roleBEmoji;
                  const img = r === 'a' ? chosenPack.roleAImage : chosenPack.roleBImage;
                  return (
                    <AnimatedButton
                      key={r}
                      onPress={() => setChosenRole(r)}
                      style={[
                        styles.roleCard,
                        selected && {
                          borderColor: chosenPack.accent,
                          borderWidth: 2,
                        },
                      ]}
                    >
                      <Image
                        source={img}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={80}
                      />
                      <View style={styles.roleOverlay}>
                        <Text style={styles.roleEmoji}>{emoji ?? '·'}</Text>
                        <Text style={styles.roleLabel}>{label}</Text>
                        <Text style={styles.roleSub}>
                          {selected ? '✓ Your side' : 'tap to pick'}
                        </Text>
                      </View>
                    </AnimatedButton>
                  );
                })}
              </View>
            </>
          ) : null}

          {generatedCode ? (
            <View style={styles.codeWrap}>
              <Text style={[styles.codeText, { color: theme.primary }]}>
                {generatedCode}
              </Text>
              <Text style={styles.codeMeta}>
                You · {chosenPack.name} · {chosenRole === 'a' ? chosenPack.roleALabel : chosenPack.roleBLabel}
                {chosenRole === 'a' ? ` ${chosenPack.roleAEmoji ?? ''}` : ` ${chosenPack.roleBEmoji ?? ''}`}
              </Text>
              <View style={styles.codeBtnRow}>
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
              <AnimatedButton
                onPress={() => router.replace('/couple/linking' as Href)}
                style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.primaryBtnText}>Continue → Waiting room</Text>
              </AnimatedButton>
            </View>
          ) : (
            <AnimatedButton
              onPress={onGenerate}
              disabled={busy != null}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: isCouplePremium ? theme.primary : Colors.surfaceHi,
                  opacity: busy === 'create' ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons
                name={isCouplePremium ? 'sparkles' : 'lock-closed'}
                size={16}
                color={isCouplePremium ? '#131313' : Colors.textDim}
              />
              <Text
                style={[
                  styles.primaryBtnText,
                  { color: isCouplePremium ? '#131313' : Colors.textDim },
                ]}
              >
                {busy === 'create' ? 'Generating…' : 'Generate code'}
              </Text>
            </AnimatedButton>
          )}
        </View>

        {/* ─── OR DIVIDER ─── */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {/* ─── ACCEPT CARD ─── */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.cardIcon, { backgroundColor: Colors.cyan }]}>
              <Ionicons name="key" size={18} color="#131313" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                I'm Person B — I have a code
              </Text>
              <Text style={styles.cardBody}>
                Enter your partner's LOVE-XXXX code. Couple Premium
                unlocks automatically for you.
              </Text>
            </View>
          </View>

          <Pressable style={styles.input}>
            <TextInput
              value={enterInput}
              onChangeText={(t) => setEnterInput(t.toUpperCase())}
              placeholder="LOVE-ABCD"
              placeholderTextColor={Colors.textDim}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={9}
              style={[styles.inputText, { color: theme.text }]}
            />
          </Pressable>

          {/* OPTIONAL ROLE OVERRIDE */}
          <Text style={styles.sectionLabel}>Pick your side (optional)</Text>
          <Text style={styles.sectionSubLabel}>
            Leave on Auto and you'll get whichever side your partner didn't
            take. Or override here.
          </Text>
          <View style={styles.acceptRoleRow}>
            {(
              [
                { v: null, label: 'Auto', emoji: '🪄' },
                { v: 'a', label: 'Side A', emoji: '👈' },
                { v: 'b', label: 'Side B', emoji: '👉' },
              ] as { v: CoupleRole | null; label: string; emoji: string }[]
            ).map(({ v, label, emoji }) => {
              const selected = v === acceptRole;
              return (
                <AnimatedButton
                  key={label}
                  onPress={() => setAcceptRole(v)}
                  style={[
                    styles.acceptRoleChip,
                    selected && {
                      borderColor: Colors.cyan,
                      backgroundColor: 'rgba(168,231,216,0.12)',
                    },
                  ]}
                >
                  <Text style={styles.acceptRoleEmoji}>{emoji}</Text>
                  <Text
                    style={[
                      styles.acceptRoleLabel,
                      { color: selected ? Colors.cyan : Colors.textDim },
                    ]}
                  >
                    {label}
                  </Text>
                </AnimatedButton>
              );
            })}
          </View>

          <AnimatedButton
            onPress={onAccept}
            disabled={busy != null}
            style={[
              styles.primaryBtn,
              {
                backgroundColor: Colors.cyan,
                opacity: busy === 'accept' ? 0.6 : 1,
              },
            ]}
          >
            <Ionicons name="link" size={16} color="#131313" />
            <Text style={[styles.primaryBtnText, { color: '#131313' }]}>
              {busy === 'accept' ? 'Linking…' : 'Link with partner'}
            </Text>
          </AnimatedButton>
        </View>

        <Text style={styles.privacyText}>
          <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
          {'  '}Your location is shared with your linked partner only. You
          can pause sharing or unlink any time from the dashboard.
        </Text>
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
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardHead: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  cardBody: { color: Colors.textDim, fontSize: 12, lineHeight: 18, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sectionSubLabel: {
    fontSize: 11,
    color: Colors.textDim,
    lineHeight: 16,
    marginTop: -8,
  },
  packRow: { gap: Spacing.sm, paddingVertical: 4 },
  packCard: {
    width: 160,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgAlt,
    padding: 8,
    gap: 6,
  },
  packTriptych: {
    flexDirection: 'row',
    height: 90,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.bg,
  },
  packSolo: { flex: 1, height: '100%' },
  packTogether: { flex: 1.4, height: '100%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  packName: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  packBlurb: { fontSize: 10, color: Colors.textDim, lineHeight: 14 },
  roleRow: { flexDirection: 'row', gap: Spacing.sm },
  roleCard: {
    flex: 1,
    height: 140,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  roleOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 8,
    backgroundColor: 'rgba(19,19,19,0.75)',
    alignItems: 'center',
  },
  roleEmoji: { fontSize: 18 },
  roleLabel: { color: '#fff', fontSize: 13, fontWeight: '800' },
  roleSub: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 2 },
  codeWrap: { gap: Spacing.sm, alignItems: 'center' },
  codeText: {
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 4,
    fontVariant: ['tabular-nums'],
  },
  codeMeta: { color: Colors.textDim, fontSize: 12, fontWeight: '700' },
  codeBtnRow: { flexDirection: 'row', gap: Spacing.sm },
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
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: Radius.pill,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#131313' },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  orLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  orText: { color: Colors.textDim, fontSize: 12, fontWeight: '700' },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgAlt,
    paddingHorizontal: Spacing.md,
  },
  inputText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 3,
    paddingVertical: 14,
    textAlign: 'center',
  },
  acceptRoleRow: { flexDirection: 'row', gap: Spacing.xs },
  acceptRoleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  acceptRoleEmoji: { fontSize: 14 },
  acceptRoleLabel: { fontSize: 12, fontWeight: '800' },
  privacyText: {
    fontSize: 11,
    color: Colors.textDim,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
  },
});
