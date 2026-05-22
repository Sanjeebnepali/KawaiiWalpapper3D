import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useState } from 'react';
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { premiumAlert } from '../../components/PremiumAlert';
import {
  couplePacks,
  emojiForRole,
  getCouplePack,
  labelForRole,
  pickImageForState,
} from '../../constants/couplePacks';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { setCouplePack, setCouplePaused, unlinkCouple } from '../../lib/couple';
import {
  ensureBackgroundLocationPermission,
  startCoupleLocation,
} from '../../lib/coupleLocation';
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
      const r = await setCouplePaused(link.code, !paused);
      if (!r.ok) toast(r.error ?? 'Could not update');
      else toast(paused ? '▶ Sharing resumed' : '⏸ Sharing paused');
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
        {/* ─── Partner card ─── */}
        <View style={[styles.card, { borderColor: proximityColor + '66' }]}>
          <View style={styles.partnerRow}>
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Ionicons name="person" size={26} color="#131313" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.partnerName, { color: theme.text }]}>
                {partnerName}{' '}
                {partnerRoleEmoji ? (
                  <Text style={styles.partnerRoleEmoji}>{partnerRoleEmoji}</Text>
                ) : null}
              </Text>
              <Text style={styles.partnerSub}>
                {link.code} · You: {myRoleEmoji ?? ''} {myRoleLabel} · Them:{' '}
                {partnerRoleEmoji ?? ''} {partnerRoleLabel}
              </Text>
            </View>
            <View style={[styles.statusPill, { borderColor: proximityColor }]}>
              <View
                style={[styles.statusDot, { backgroundColor: proximityColor }]}
              />
              <Text style={[styles.statusPillText, { color: proximityColor }]}>
                {proximityLabel}
              </Text>
            </View>
          </View>

          <View style={styles.distanceRow}>
            <Text style={[styles.distanceBig, { color: theme.text }]}>
              {distanceLabel}
            </Text>
            <Text style={styles.distanceSub}>Updated {lastUpdate}</Text>
          </View>

          {paused ? (
            <View style={styles.banner}>
              <Ionicons name="pause-circle" size={14} color={Colors.gold} />
              <Text style={[styles.bannerText, { color: Colors.gold }]}>
                Location sharing paused — proximity stays "apart"
              </Text>
            </View>
          ) : null}
        </View>

        {/* ─── Active wallpaper card ─── */}
        <View style={styles.card}>
          <View style={styles.cardHeadRow}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>
              On your screen now
            </Text>
            <Text style={styles.cardSubtle}>
              {activeImage?.kind === 'together'
                ? 'Together — both phones'
                : `Solo (${myRoleLabel})`}
            </Text>
          </View>

          {activeImage ? (
            <View
              style={[
                styles.activeRow,
                { borderColor: activePack.accent + '88' },
              ]}
            >
              <Image
                source={activeImage.image}
                style={styles.activeThumb}
                contentFit="cover"
                transition={120}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.activeTitle, { color: theme.text }]} numberOfLines={1}>
                  {activePack.name}
                </Text>
                <Text style={styles.activeSub}>
                  {activeImage.kind === 'together'
                    ? `Together image · applies on both phones`
                    : `Your ${myRoleLabel} half`}
                </Text>
              </View>
              <AnimatedButton
                onPress={() => router.push('/couple/preview' as Href)}
                style={styles.previewIconBtn}
              >
                <Ionicons name="eye-outline" size={18} color={Colors.textDim} />
              </AnimatedButton>
            </View>
          ) : (
            <View style={[styles.activeRow, styles.activeEmpty]}>
              <Ionicons name="heart-outline" size={22} color={Colors.textDim} />
              <Text style={styles.activeEmptyText}>
                Waiting for both sides to report in.
              </Text>
            </View>
          )}
        </View>

        {/* ─── Pack picker — full-width triptychs ─── */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>
            Choose a couple pack
          </Text>
          <Text style={styles.cardSubtle}>
            Either of you can pick. The pack defines the together image AND
            both solo halves. Role labels (Boy/Girl, Sun/Moon, …) come from
            the pack — your side stays the same when you switch packs.
          </Text>
          <View style={styles.packGrid}>
            {couplePacks.map((p) => {
              const selected = p.id === packId;
              return (
                <AnimatedButton
                  key={p.id}
                  onPress={() => !picking && onPickPack(p.id)}
                  style={[
                    styles.packTile,
                    selected && {
                      borderColor: p.accent,
                      borderWidth: 2,
                    },
                  ]}
                >
                  <View style={styles.packTileTriptych}>
                    <Image
                      source={p.roleAImage}
                      style={styles.packTileSolo}
                      contentFit="cover"
                    />
                    <Image
                      source={p.togetherImage}
                      style={styles.packTileTogether}
                      contentFit="cover"
                    />
                    <Image
                      source={p.roleBImage}
                      style={styles.packTileSolo}
                      contentFit="cover"
                    />
                  </View>
                  <View style={styles.packTileMeta}>
                    <Text
                      style={[styles.packTileName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {p.name}
                    </Text>
                    <Text style={styles.packTileBlurb} numberOfLines={1}>
                      {p.roleALabel} · {p.roleBLabel}
                    </Text>
                  </View>
                  {selected ? (
                    <View
                      style={[styles.selectedDot, { backgroundColor: p.accent }]}
                    >
                      <Ionicons name="checkmark" size={12} color="#131313" />
                    </View>
                  ) : null}
                </AnimatedButton>
              );
            })}
          </View>
        </View>

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

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDistance(m: number | null): string {
  if (m == null) return '— m';
  if (m < 50) return `${Math.round(m)} m`;
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m / 1000)} km`;
}
function formatRelative(ms: number): string {
  if (ms < 30_000) return 'just now';
  if (ms < 60_000) return 'seconds ago';
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 24 * 60 * 60_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
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
  menuBtn: {
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
  card: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    gap: Spacing.sm,
  },
  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  partnerRoleEmoji: { fontSize: 14 },
  partnerSub: { color: Colors.textDim, fontSize: 11, fontWeight: '600', marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  distanceRow: { paddingTop: Spacing.xs },
  distanceBig: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  distanceSub: { color: Colors.textDim, fontSize: 12, fontWeight: '600' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(232,194,117,0.08)',
  },
  bannerText: { fontSize: 12, fontWeight: '700' },
  cardHeadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  cardTitle: { fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  cardSubtle: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  activeThumb: { width: 64, height: 80, borderRadius: Radius.sm },
  activeTitle: { fontSize: 14, fontWeight: '800' },
  activeSub: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
  activeEmpty: { justifyContent: 'flex-start', backgroundColor: Colors.bgAlt },
  activeEmptyText: { color: Colors.textDim, fontSize: 12, flex: 1 },
  previewIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  packGrid: { gap: Spacing.sm },
  packTile: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.bgAlt,
    overflow: 'hidden',
  },
  packTileTriptych: { flexDirection: 'row', height: 88 },
  packTileSolo: { flex: 1, height: '100%' },
  packTileTogether: {
    flex: 1.4,
    height: '100%',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: Colors.border,
  },
  packTileMeta: { paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  packTileName: { fontSize: 13, fontWeight: '800', letterSpacing: -0.2 },
  packTileBlurb: { fontSize: 10, color: Colors.textDim },
  selectedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  ctrlBtnText: { fontSize: 13, fontWeight: '800' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: Radius.pill,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: '#131313' },
  privacyText: {
    fontSize: 11,
    color: Colors.textDim,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  errText: {
    color: '#ff6b6b',
    fontSize: 12,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
});
