import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { AcceptCard } from '../../components/coupleSetup/AcceptCard';
import { GenerateCard } from '../../components/coupleSetup/GenerateCard';
import { RestoreBanner } from '../../components/coupleSetup/RestoreBanner';
import { styles } from '../../components/coupleSetup/styles';
import { gateCouplePremium } from '../../components/PremiumLock';
import {
  couplePacks,
  type CoupleRole,
  getCouplePack,
} from '../../constants/couplePacks';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { enforceSingleDriver } from '../../lib/automationMode';
import {
  acceptCoupleCode,
  createCoupleCode,
  fetchActiveCouple,
  isWellFormedCode,
  normaliseCode,
  restoreCouple,
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
  const [restoring, setRestoring] = useState(false);

  // Auto-attempt a SILENT restore when this screen opens (changes/105). A
  // device whose local link was wiped (reinstall) can rejoin its existing
  // couple with no code entry: restoreCouple() re-reads the server pairing and
  // pushes it into the store; the linked-status effect above then routes to
  // the dashboard. If bootstrap already restored it (or there's nothing to
  // restore) this is a cheap no-op — no toast, so it never nags. Runs once.
  useEffect(() => {
    if (link?.status === 'linked' || link?.status === 'pending') return;
    void restoreCouple();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Linking is an explicit "I want Couple now" — claim the driver slot so
      // Couple isn't suppressed by a still-active Theme/Mood/Friend driver.
      await enforceSingleDriver('couple');
      toast('💕 Linked');
      router.replace('/couple/dashboard' as Href);
    } finally {
      setBusy(null);
    }
  }, [authStatus, enterInput, acceptRole, router]);

  // Explicit "Restore pairing" — for a reinstalled device. Re-reads the
  // server pairing for the signed-in account and routes to the right screen.
  // Unlike the silent on-mount attempt, this one toasts the outcome so the
  // user gets clear feedback when they tap the button (changes/105).
  const onRestore = useCallback(async () => {
    if (authStatus !== 'authed') {
      toast('Sign in first to restore your pairing');
      return;
    }
    setRestoring(true);
    try {
      const restored = await restoreCouple();
      if (!restored) {
        // Most common causes: signed into a different account than the one that
        // paired, or the pairing was unlinked. (The server-side reconnect RPC
        // `get_my_couple` must also be deployed — see supabase/couple_reconnect_v3.sql.)
        toast('No active pairing found — sign in with the account that paired');
        return;
      }
      if (restored.status === 'linked') {
        toast('💕 Reconnected');
        router.replace('/couple/dashboard' as Href);
      } else if (restored.status === 'pending') {
        // The user's own un-accepted code — send them to the waiting room.
        router.replace('/couple/linking' as Href);
      }
    } finally {
      setRestoring(false);
    }
  }, [authStatus, router]);

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
        {/* ─── RESTORE (reinstalled device rejoins its existing couple) ─── */}
        <RestoreBanner onRestore={onRestore} restoring={restoring} theme={theme} />

        {/* ─── GENERATE CARD ─── */}
        <GenerateCard
          generatedCode={generatedCode}
          theme={theme}
          chosenPackId={chosenPackId}
          setChosenPackId={setChosenPackId}
          chosenRole={chosenRole}
          setChosenRole={setChosenRole}
          chosenPack={chosenPack}
          busy={busy}
          isCouplePremium={isCouplePremium}
          onCopy={onCopy}
          onShare={onShare}
          onGenerate={onGenerate}
          router={router}
        />

        {/* ─── OR DIVIDER ─── */}
        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.orLine} />
        </View>

        {/* ─── ACCEPT CARD ─── */}
        <AcceptCard
          theme={theme}
          enterInput={enterInput}
          setEnterInput={setEnterInput}
          acceptRole={acceptRole}
          setAcceptRole={setAcceptRole}
          busy={busy}
          onAccept={onAccept}
        />

        <Text style={styles.privacyText}>
          <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
          {'  '}Your location is shared with your linked partner only. You
          can pause sharing or unlink any time from the dashboard.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
