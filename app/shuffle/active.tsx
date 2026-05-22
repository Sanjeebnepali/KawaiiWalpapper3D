import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { Glass } from '../../components/Glass';
import { getPhotoById } from '../../constants/mockData';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useShuffleEngine } from '../../hooks/useShuffleEngine';
import { toast } from '../../lib/toast';
import {
  useIsFavorite,
  useToggleFavorite,
} from '../../store/favorites';
import {
  useActiveCollection,
  useShuffleStore,
} from '../../store/shuffle';

/**
 * Active shuffle screen. Mounts the foreground engine, shows the current
 * wallpaper preview, a live countdown to the next change, 10 progress dots
 * for the sequence position, and Skip / Pause / Favorite buttons.
 *
 * iOS: the engine pseudo-runs (the save-to-Photos action still fires) but
 * Apple forbids programmatic wallpaper change — a callout overlay points
 * the user to Photos → Share → Use as Wallpaper.
 */
export default function ActiveShuffle() {
  const router = useRouter();
  const theme = useTheme();
  const collection = useActiveCollection();
  const paused = useShuffleStore((s) => s.paused);
  const currentIndex = useShuffleStore((s) => s.currentIndex);
  const history = useShuffleStore((s) => s.history);
  const setPaused = useShuffleStore((s) => s.setPaused);

  const { status, skipNow, isIos } = useShuffleEngine(collection);

  // Current preview = most recent history entry for this collection, else
  // the currentIndex slot in the collection's photoIds.
  const previewPhoto = useMemo(() => {
    if (!collection) return null;
    const recent = history.find((h) => h.collectionId === collection.id);
    if (recent) return { id: recent.photoId, image: recent.image };
    const pid = collection.photoIds[currentIndex];
    if (!pid) return null;
    const p = getPhotoById(pid);
    return p ? { id: p.id, image: p.image } : null;
  }, [collection, history, currentIndex]);

  const isFav = useIsFavorite(previewPhoto?.id ?? '');
  const toggleFav = useToggleFavorite();

  if (!collection) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <View style={styles.emptyWrap}>
          <Ionicons name="play-skip-forward-outline" size={42} color={Colors.textDim} />
          <Text style={[styles.title, { color: theme.text }]}>
            No collection is active
          </Text>
          <Text style={styles.helperText}>
            Pick a collection and tap "Start shuffle" to get going.
          </Text>
          <AnimatedButton
            onPress={() => router.replace('/wallpapers/theme-packs')}
            style={[styles.primaryBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={styles.primaryBtnText}>Open theme packs</Text>
          </AnimatedButton>
        </View>
      </SafeAreaView>
    );
  }

  const countdownLabel = describeStatus(status);

  const onSkip = async () => {
    const r = await skipNow();
    if (!r.ok) toast(r.message);
  };

  const onToggleFav = () => {
    if (!previewPhoto) return;
    toggleFav(previewPhoto.id);
    toast(isFav ? 'Removed from favorites' : '✓ Added to favorites');
  };

  const onTogglePause = () => {
    setPaused(!paused);
    toast(paused ? '▶ Resumed' : '⏸ Paused');
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {previewPhoto ? (
        <Image
          source={{ uri: previewPhoto.image }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={160}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.bg }]} />
      )}

      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'transparent', 'rgba(0,0,0,0.85)']}
        locations={[0, 0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.chrome} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <AnimatedButton
            onPress={() => router.back()}
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </AnimatedButton>
          <View style={[styles.tag, { borderColor: theme.primary }]}>
            <View style={[styles.tagDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.tagText, { color: theme.primary }]} numberOfLines={1}>
              {collection.name}
            </Text>
          </View>
          <AnimatedButton
            onPress={() => router.push('/shuffle/history')}
            style={styles.iconBtn}
            hitSlop={10}
          >
            <Ionicons name="time-outline" size={20} color={Colors.text} />
          </AnimatedButton>
        </View>

        {/* Progress dots — one per slot in the collection */}
        <View style={styles.dotsRow}>
          {collection.photoIds.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === currentIndex && {
                  backgroundColor: theme.primary,
                  width: 18,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.footer}>
          {isIos ? (
            <Glass intensity={50} tint="dark" style={[styles.iosCallout, { borderColor: theme.primary }]}>
              <Ionicons name="phone-portrait" size={18} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.iosTitle, { color: theme.text }]}>
                  iOS manual step required
                </Text>
                <Text style={styles.iosBody}>
                  Each change saves to Photos. Open Photos › Share › Use as Wallpaper to apply.
                </Text>
              </View>
            </Glass>
          ) : null}

          <Glass intensity={50} tint="dark" style={styles.statusGlass}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabel}>
                {countdownLabel.heading}
              </Text>
              <Text style={[styles.statusValue, { color: theme.text }]}>
                {countdownLabel.body}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: paused ? Colors.textMute : theme.primary },
              ]}
            >
              <Ionicons
                name={paused ? 'pause' : 'sync'}
                size={14}
                color="#131313"
              />
            </View>
          </Glass>

          <View style={styles.actionsRow}>
            <AnimatedButton
              onPress={onTogglePause}
              style={[styles.actionBtn, { backgroundColor: Colors.surface }]}
              hitSlop={6}
            >
              <Ionicons
                name={paused ? 'play' : 'pause'}
                size={20}
                color={theme.text}
              />
              <Text style={[styles.actionText, { color: theme.text }]}>
                {paused ? 'Resume' : 'Pause'}
              </Text>
            </AnimatedButton>

            <AnimatedButton
              onPress={onSkip}
              style={[styles.actionBtn, { backgroundColor: theme.primary }]}
              hitSlop={6}
            >
              <Ionicons name="play-skip-forward" size={20} color="#131313" />
              <Text style={[styles.actionText, { color: '#131313' }]}>
                Skip
              </Text>
            </AnimatedButton>

            <AnimatedButton
              onPress={onToggleFav}
              style={[
                styles.actionBtn,
                {
                  backgroundColor: Colors.surface,
                  borderColor: isFav ? theme.primary : Colors.border,
                  borderWidth: 1,
                },
              ]}
              hitSlop={6}
              disabled={!previewPhoto}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={20}
                color={isFav ? theme.primary : theme.text}
              />
              <Text style={[styles.actionText, { color: theme.text }]}>
                {isFav ? 'Favorited' : 'Favorite'}
              </Text>
            </AnimatedButton>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function describeStatus(
  status: ReturnType<typeof useShuffleEngine>['status'],
): { heading: string; body: string } {
  switch (status.kind) {
    case 'idle':
      switch (status.reason) {
        case 'no-active':
          return { heading: 'Idle', body: 'No active collection' };
        case 'empty':
          return { heading: 'Idle', body: 'Add photos to the collection' };
        case 'paused':
          return { heading: 'Paused', body: 'Shuffle is paused' };
        case 'dnd':
          return { heading: 'Quiet hours', body: 'Shuffle resumes after DND window' };
        case 'ios':
          return { heading: 'iOS manual', body: 'Tap to save next wallpaper' };
      }
      // Defensive: TS exhaustiveness — never reached
      return { heading: 'Idle', body: '' };
    case 'applying':
      return { heading: 'Updating', body: Platform.OS === 'ios' ? 'Saving to Photos…' : 'Applying wallpaper…' };
    case 'running': {
      const ms = Math.max(0, status.nextChangeAt - Date.now());
      return { heading: 'Next change in', body: formatCountdown(ms) };
    }
  }
}

function formatCountdown(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  safe: { flex: 1 },
  chrome: { flex: 1, justifyContent: 'space-between', paddingHorizontal: Spacing.lg },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderColor: Colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    flex: 0,
    maxWidth: '60%',
  },
  tagDot: { width: 6, height: 6, borderRadius: 3 },
  tagText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  footer: { gap: Spacing.md, paddingBottom: Spacing.md },
  iosCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: Colors.glassFill,
  },
  iosTitle: { fontSize: 13, fontWeight: '800' },
  iosBody: { color: Colors.textDim, fontSize: 11, fontWeight: '600', marginTop: 1 },
  statusGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.glassStroke,
    backgroundColor: Colors.glassFill,
  },
  statusLabel: { color: Colors.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  statusValue: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  statusBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: Radius.pill,
  },
  actionText: { fontSize: 12, fontWeight: '800' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: { fontSize: 18, fontWeight: '800' },
  helperText: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
  },
  primaryBtnText: { color: '#131313', fontSize: 13, fontWeight: '800' },
});
