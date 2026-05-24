import { Ionicons } from '@expo/vector-icons';
import { type Href, useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { CoupleActiveWallpaperCard } from '../../components/coupleDashboard/CoupleActiveWallpaperCard';
import { CoupleDiagnostics } from '../../components/coupleDashboard/CoupleDiagnostics';
import { CouplePackPicker } from '../../components/coupleDashboard/CouplePackPicker';
import { CouplePartnerCard } from '../../components/coupleDashboard/CouplePartnerCard';
import { styles } from '../../components/coupleDashboard/styles';
import { premiumAlert } from '../../components/PremiumAlert';
import {
  emojiForRole,
  getCouplePack,
  labelForRole,
  pickImageForState,
} from '../../constants/couplePacks';
import { Colors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { enforceSingleDriver } from '../../lib/automationMode';
import { setCouplePack, setCouplePaused, unlinkCouple } from '../../lib/couple';
import { formatDistance, formatRelative } from '../../lib/coupleDashboardFormat';
import {
  ensureBackgroundLocationPermission,
  startCoupleLocation,
} from '../../lib/coupleLocation';
import {
  startCoupleLiveTracking,
  stopCoupleLiveTracking,
} from '../../lib/coupleLiveTracking';
import { applyProximityWallpaper } from '../../lib/coupleWallpaper';
import { toast } from '../../lib/toast';
import {
  useCoupleDistance,
  useCoupleLink,
  useCouplePackId,
  useCouplePaused,
  useCoupleProximity,
  useCoupleStore,
} from '../../store/couple';

/**
 * Couple Dashboard — main connected view.
 *
 * Now pack-driven: the wallpaper picker shows TRIPTYCHS (3-image
 * previews — together + role-a-solo + role-b-solo), and the partner
 * card surfaces the role labels resolved against the active pack.
 *
 * Either partner can swap the pack; the role stays — switching from
 * "Boy / Girl" labels to "Sun / Moon" labels doesn't re-assign sides.
 */
export default function CoupleDashboard() {
  const router = useRouter();
  const theme = useTheme();
  const link = useCoupleLink();
  const proximity = useCoupleProximity();
  const distanceM = useCoupleDistance();
  const paused = useCouplePaused();
  const packId = useCouplePackId();
  const partnerUpdatedAt = useCoupleStore((s) => s.partnerUpdatedAt);
  const error = useCoupleStore((s) => s.error);

  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const activePack = useMemo(() => getCouplePack(packId), [packId]);

  // While this screen is focused, refresh our GPS + the partner's position
  // fast (Uber-style live distance) instead of the slow battery-saving
  // background cadence; revert on blur/unmount. Before the early return so the
  // hook order stays stable — the tracker itself no-ops when not linked.
  useFocusEffect(
    useCallback(() => {
      startCoupleLiveTracking();
      return () => stopCoupleLiveTracking();
    }, []),
  );

  if (!link || link.status !== 'linked') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Not linked yet
          </Text>
          <AnimatedButton
            onPress={() => router.replace('/couple/setup' as Href)}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.primaryBtnText}>Open Setup</Text>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  }

  const partnerName = link.partner?.display_name ?? 'your partner';
  const myRole = link.myRole;
  const partnerRole = link.partnerRole;

  const myRoleLabel = myRole ? labelForRole(activePack, myRole) : '—';
  const myRoleEmoji = myRole ? emojiForRole(activePack, myRole) : null;
  const partnerRoleLabel = partnerRole ? labelForRole(activePack, partnerRole) : '—';
  const partnerRoleEmoji = partnerRole ? emojiForRole(activePack, partnerRole) : null;

  const distanceLabel = useMemo(() => formatDistance(distanceM), [distanceM]);
  const proximityLabel =
    proximity === 'near' ? 'Together' : proximity === 'far' ? 'Apart' : '—';
  const proximityColor =
    proximity === 'near' ? theme.primary : proximity === 'far' ? Colors.cyan : Colors.textDim;
  const lastUpdate = partnerUpdatedAt
    ? formatRelative(Date.now() - partnerUpdatedAt)
    : 'no data yet';

  // What's actually applied right now: together image, or my-solo from
  // the pack. Drives the "Active wallpaper" card.
  const activeImage = useMemo(() => {
    if (!myRole) return null;
    return pickImageForState(
      activePack,
      myRole,
      proximity === 'near' ? 'near' : 'far',
    );
  }, [activePack, myRole, proximity]);

  // ─── Handlers ───────────────────────────────────────────────────────
  const onPickPack = useCallback(
    async (newPackId: string) => {
      if (newPackId === packId) return;
      setPicking(true);
      try {
        const r = await setCouplePack(link.code, newPackId);
        if (!r.ok) {
          toast(r.error ?? 'Could not save');
          return;
        }
        toast('✓ Pack switched');
        // Bootstrap subscriber also fires applyProximityWallpaper on
        // pack change; calling here too means zero perceived lag.
        await applyProximityWallpaper();
      } finally {
        setPicking(false);
      }
    },
    [link.code, packId],
  );

  const onTogglePause = useCallback(async () => {
    setBusy(true);
    try {
      const wasPaused = paused;
      const r = await setCouplePaused(link.code, !paused);
      if (!r.ok) {
        toast(r.error ?? 'Could not update');
        return;
      }
      if (wasPaused) {
        // Resuming Couple = claim the driver slot: stop Theme/Mood/Friend so
        // they don't fight over the wallpaper.
        const stopped = await enforceSingleDriver('couple');
        toast(
          stopped.length
            ? `▶ Sharing resumed · ${stopped.join(' + ')} paused`
            : '▶ Sharing resumed',
        );
      } else {
        toast('⏸ Sharing paused');
      }
    } finally {
      setBusy(false);
    }
  }, [link.code, paused]);

  const onUnlink = useCallback(() => {
    premiumAlert({
      title: 'Unlink couple?',
      message: `You'll stop sharing location with ${partnerName}. You can re-link later with a new code.`,
      icon: 'unlink-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          onPress: async () => {
            const r = await unlinkCouple();
            if (!r.ok) {
              toast(r.error ?? 'Could not unlink');
              return;
            }
            toast('Unlinked');
            router.replace('/couple/setup' as Href);
          },
        },
      ],
    });
  }, [partnerName, router]);

  const onCheckPermission = useCallback(async () => {
    setBusy(true);
    try {
      const status = await ensureBackgroundLocationPermission();
      if (status === 'denied') {
        premiumAlert({
          title: 'Location denied',
          message:
            'Open Settings and grant location permission for proximity to work.',
          icon: 'location-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      if (status === 'foreground-only') {
        premiumAlert({
          title: 'Background access needed',
          message:
            'Proximity needs background location (Always Allow) to keep working when the app is closed. Open Settings to grant it.',
          icon: 'navigate-circle-outline',
          buttons: [
            { text: 'Later', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      await startCoupleLocation();
      toast('✓ Location sharing active');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <Text style={[styles.title, { color: theme.text }]}>Couple</Text>
        <AnimatedButton onPress={onUnlink} style={styles.menuBtn}>
          <Ionicons name="ellipsis-horizontal" size={20} color={theme.text} />
        </AnimatedButton>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
        <CouplePartnerCard
          partnerName={partnerName}
          partnerRoleEmoji={partnerRoleEmoji}
          code={link.code}
          myRoleEmoji={myRoleEmoji}
          myRoleLabel={myRoleLabel}
          partnerRoleLabel={partnerRoleLabel}
          proximityColor={proximityColor}
          proximityLabel={proximityLabel}
          distanceLabel={distanceLabel}
          lastUpdate={lastUpdate}
          paused={paused}
        />

        <CoupleDiagnostics />

        <CoupleActiveWallpaperCard
          activeImage={activeImage}
          activePack={activePack}
          myRoleLabel={myRoleLabel}
          onPreview={() => router.push('/couple/preview' as Href)}
        />

        <CouplePackPicker packId={packId} picking={picking} onPickPack={onPickPack} />

        {/* ─── Controls ─── */}
        <View style={styles.controlsRow}>
          <AnimatedButton
            onPress={onTogglePause}
            disabled={busy}
            style={[
              styles.ctrlBtn,
              { backgroundColor: paused ? Colors.gold : Colors.surfaceHi },
            ]}
          >
            <Ionicons
              name={paused ? 'play' : 'pause'}
              size={16}
              color={paused ? '#131313' : theme.text}
            />
            <Text
              style={[
                styles.ctrlBtnText,
                { color: paused ? '#131313' : theme.text },
              ]}
            >
              {paused ? 'Resume' : 'Pause sharing'}
            </Text>
          </AnimatedButton>

          <AnimatedButton
            onPress={onCheckPermission}
            disabled={busy}
            style={[styles.ctrlBtn, { backgroundColor: Colors.surfaceHi }]}
          >
            <Ionicons name="location-outline" size={16} color={theme.text} />
            <Text style={[styles.ctrlBtnText, { color: theme.text }]}>
              Check GPS
            </Text>
          </AnimatedButton>
        </View>

        <Text style={styles.privacyText}>
          <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
          {'  '}Location shared with {partnerName} only.
        </Text>

        {error ? <Text style={styles.errText}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
