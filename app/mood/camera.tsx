import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AnimatedButton } from '../../components/AnimatedButton';
import { MoodConfidenceMeter } from '../../components/MoodConfidenceMeter';
import { premiumAlert } from '../../components/PremiumAlert';
import { gatePremium, PremiumLock } from '../../components/PremiumLock';
import { getPhotoById } from '../../constants/mockData';
import { getMoodOrDefault } from '../../constants/moods';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getCameraPermission,
  requestCameraPermission,
} from '../../lib/cameraPermission';
import { applyMoodPhotoFromCollection } from '../../lib/moodEngineActions';
import { toast } from '../../lib/toast';
import { hydrateMoodStore, useMoodStore } from '../../store/mood';
import { useCollections } from '../../store/shuffle';

/**
 * Mood Mode — Live View.
 *
 * This is a STATUS screen, not a CameraView screen. The actual camera lives
 * in the global `MoodEngineHost` (`app/_layout.tsx`); having a second
 * CameraView here would deadlock the device camera. Instead we render the
 * current mood + confidence + currently-applied photo, with controls to
 * force-rescan or stop Mood Mode.
 */
export default function MoodLiveScreen() {
  const router = useRouter();
  const theme = useTheme();

  const hydrated = useMoodStore((s) => s.hydrated);
  const currentMood = useMoodStore((s) => s.currentMood);
  const lastConfidence = useMoodStore((s) => s.lastConfidence);
  const lastSource = useMoodStore((s) => s.lastSource);
  const moodModeEnabled = useMoodStore((s) => s.moodModeEnabled);
  const moodCollectionId = useMoodStore((s) => s.moodCollectionId);
  const currentPhotoId = useMoodStore((s) => s.currentPhotoId);
  const setMoodModeEnabled = useMoodStore((s) => s.setMoodModeEnabled);
  const setCurrentMoodPhoto = useMoodStore((s) => s.setCurrentMoodPhoto);

  const collections = useCollections();
  const activeCollection =
    collections.find((c) => c.id === moodCollectionId) ?? null;
  const currentPhoto = currentPhotoId ? getPhotoById(currentPhotoId) : null;
  const mood = getMoodOrDefault(currentMood);

  useEffect(() => {
    if (!hydrated) hydrateMoodStore();
  }, [hydrated]);

  // breathing dot when mode is on
  const pulse = useSharedValue(0.6);
  useEffect(() => {
    if (!moodModeEnabled) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [moodModeEnabled, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const onStart = useCallback(() => {
    gatePremium(async () => {
      let p = await getCameraPermission();
      if (p.moduleMissing) {
        premiumAlert({
          title: 'Camera not installed',
          message: 'expo-camera needs a native rebuild. Run `npx expo run:android` and reopen.',
          icon: 'construct-outline',
        });
        return;
      }
      if (!p.granted) {
        if (!p.canAskAgain) {
          premiumAlert({
            title: 'Camera access blocked',
            message: 'Open Settings to allow camera access.',
            icon: 'lock-closed',
            buttons: [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          });
          return;
        }
        p = await requestCameraPermission();
        if (!p.granted) return;
      }
      if (!moodCollectionId) {
        router.push('/mood/pick-collection' as Href);
        return;
      }
      await setMoodModeEnabled(true);
      toast('✓ Mood Mode on');
    });
  }, [moodCollectionId, setMoodModeEnabled, router]);

  const onStop = useCallback(async () => {
    await setMoodModeEnabled(false);
    toast('Mood Mode paused');
  }, [setMoodModeEnabled]);

  const onForceApply = useCallback(async () => {
    if (!activeCollection || !currentMood) {
      toast('Pick a Collection and a mood first');
      return;
    }
    const r = await applyMoodPhotoFromCollection(
      currentMood,
      activeCollection.id,
      currentPhotoId,
    );
    if (r.ok && r.photoId) {
      await setCurrentMoodPhoto(r.photoId);
      toast('✓ Wallpaper refreshed');
    } else {
      toast(r.message);
    }
  }, [activeCollection, currentMood, currentPhotoId, setCurrentMoodPhoto]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <AnimatedButton onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </AnimatedButton>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Mood Mode</Text>
          <Text style={styles.subtitle}>
            {moodModeEnabled
              ? 'Live · scanning every 60s'
              : 'Paused'}
          </Text>
        </View>
        <PremiumLock />
      </View>

      {/* Hero — current mood */}
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={mood.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroEmoji}>{mood.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroLabel}>{mood.label}</Text>
            <Text style={styles.heroTag}>
              {lastSource === 'camera'
                ? `Detected via camera · ${Math.round(lastConfidence * 100)}% sure`
                : lastSource === 'manual'
                  ? 'You picked it'
                  : 'No detection yet'}
            </Text>
          </View>
          {moodModeEnabled ? (
            <Animated.View style={[styles.heroDot, pulseStyle]} />
          ) : null}
        </LinearGradient>
      </View>

      {/* Status card */}
      <View style={styles.card}>
        <MoodConfidenceMeter
          mood={mood}
          confidence={lastConfidence}
          live={moodModeEnabled}
        />

        {/* Collection */}
        <AnimatedButton
          onPress={() => router.push('/mood/pick-collection' as Href)}
          style={styles.poolRow}
        >
          {activeCollection ? (
            <>
              <View style={styles.poolThumb}>
                <Image
                  source={{
                    uri: getPhotoById(activeCollection.photoIds[0])?.image ?? '',
                  }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={80}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.poolLabel}>POOL</Text>
                <Text style={[styles.poolName, { color: theme.text }]} numberOfLines={1}>
                  {activeCollection.name}
                </Text>
                <Text style={styles.poolMeta}>
                  {activeCollection.photoIds.length} photos
                </Text>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.poolThumb, styles.poolThumbEmpty]}>
                <Ionicons name="add" size={20} color={Colors.textDim} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.poolLabel}>POOL</Text>
                <Text style={[styles.poolName, { color: theme.text }]}>
                  Pick a Collection
                </Text>
              </View>
            </>
          )}
          <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
        </AnimatedButton>

        {/* Currently applied */}
        {currentPhoto ? (
          <AnimatedButton
            onPress={() => router.push(`/wallpaper/${currentPhoto.id}` as Href)}
            style={styles.appliedRow}
          >
            <Image
              source={{ uri: currentPhoto.image }}
              style={styles.appliedThumb}
              contentFit="cover"
              transition={80}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.poolLabel}>APPLIED</Text>
              <Text style={[styles.poolName, { color: theme.text }]} numberOfLines={1}>
                {currentPhoto.title}
              </Text>
            </View>
            <Ionicons name="open-outline" size={16} color={Colors.textDim} />
          </AnimatedButton>
        ) : null}

        {/* Privacy */}
        <View style={styles.privacy}>
          <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
          <Text style={styles.privacyText}>
            Face never stored or sent. Camera pauses when app is in background.
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          {moodModeEnabled ? (
            <>
              <AnimatedButton
                onPress={onForceApply}
                style={[styles.secondaryBtn, { borderColor: theme.primary }]}
              >
                <Ionicons name="refresh" size={16} color={theme.primary} />
                <Text style={[styles.secondaryText, { color: theme.primary }]}>
                  Refresh now
                </Text>
              </AnimatedButton>
              <AnimatedButton onPress={onStop} style={styles.primaryBtn}>
                <LinearGradient
                  colors={[Colors.error, '#c8453a']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="stop" size={16} color="#131313" />
                <Text style={styles.primaryText}>Stop Mood Mode</Text>
              </AnimatedButton>
            </>
          ) : (
            <AnimatedButton onPress={onStart} style={styles.primaryBtn}>
              <LinearGradient
                colors={[theme.primary, theme.secondary]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="play" size={16} color="#131313" />
              <Text style={styles.primaryText}>Start Mood Mode</Text>
            </AnimatedButton>
          )}
        </View>
      </View>
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
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { color: Colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 2 },

  heroWrap: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  hero: {
    borderRadius: Radius.xxl,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  heroEmoji: { fontSize: 56, lineHeight: 64 },
  heroLabel: {
    color: '#131313',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  heroTag: {
    color: '#131313',
    opacity: 0.78,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.2,
  },
  heroDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    shadowColor: '#fff',
  },

  card: {
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  poolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
  },
  poolThumb: {
    width: 48,
    height: 60,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceHi,
  },
  poolThumbEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  poolLabel: {
    color: Colors.textMute,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  poolName: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  poolMeta: { color: Colors.textDim, fontSize: 11, fontWeight: '700', marginTop: 2 },

  appliedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.bgAlt,
  },
  appliedThumb: {
    width: 48,
    height: 60,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceHi,
  },

  privacy: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: {
    color: Colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    flex: 1,
  },

  actions: { flexDirection: 'row', gap: Spacing.sm },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  primaryText: {
    color: '#131313',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
  },
  secondaryText: { fontSize: 13, fontWeight: '800' },
});
