import { Ionicons } from '@expo/vector-icons';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PremiumSheet } from '../../components/PremiumSheet';
import { AnimatedButton } from '../../components/AnimatedButton';
import { MoodEmojiButton } from '../../components/MoodEmojiButton';
import { premiumAlert } from '../../components/PremiumAlert';
import { gateFeature, PremiumLock } from '../../components/PremiumLock';
import { SimpleButton } from '../../components/SimpleButton';
import { CustomSlot } from '../../components/moodHome/CustomSlot';
import {
  formatHour,
  formatMinutes,
  labelForSource,
  nextDailyAt,
  resolveCustomImage,
  timeAgo,
} from '../../components/moodHome/helpers';
import {
  customSheetStyles,
  pickerStripStyles,
  styles,
  swStyles,
} from '../../components/moodHome/styles';
import {
  getMoodPhotos,
  getPhotoById,
  getThemePackPhotos,
  moodAlbums,
} from '../../constants/mockData';
import {
  getMoodOrDefault,
  MANUAL_MOOD_IDS,
  MOOD_BY_ID,
  type MoodId,
} from '../../constants/moods';
import { Colors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getCameraPermission,
  requestCameraPermission,
} from '../../lib/cameraPermission';
import { triggerImmediateMoodScan } from '../../components/MoodEngineHost';
import { isFriendCheckinForegroundAvailable } from '../../modules/friend-checkin-foreground';
import { runMoodBackgroundOnce } from '../../lib/moodBackgroundTask';
import { tallyMoodBuckets } from '../../lib/moodBucket';
import { applyMoodPhotoFromCollection } from '../../lib/moodEngineActions';
import {
  ensureNotificationPermission,
  FRIEND_CHECK_IN_ANDROID_FLOOR,
  FRIEND_CHECK_IN_PRESETS,
  scheduleFriendCheckInNotification,
} from '../../lib/moodNotifications';
import {
  CUSTOM_SLEEP_WAKE_ID,
  SLEEP_WAKE_PACKS,
  getSleepWakePack,
  getSleepWakePhoto,
} from '../../constants/sleepWakePacks';
import { pickGalleryImage, pickGalleryImages } from '../../lib/galleryPicker';
import { ensureMotionPermission, getStepStatus } from '../../lib/stepCount';
import { toast } from '../../lib/toast';
import { confirmDriverSwitch } from '../../lib/confirmDriverSwitch';
import {
  downloadInternetImage,
  setAsWallpaper,
} from '../../lib/wallpaperActions';
import { useEntitlement } from '../../lib/billing';
import { COLLECTION_SIZE } from '../../constants/shuffle';
import { hydrateMoodStore, useMoodStore } from '../../store/mood';
import { useCollections, useShuffleStore } from '../../store/shuffle';

const SIDE = Spacing.lg;
const GAP = Spacing.sm + 2;

/**
 * Camera-based Mood Mode is intentionally disabled in this build
 * (changes/039). The Vivo OriginOS PreviewView refused to allocate a real
 * Surface for the hidden CameraView in every positioning strategy we tried.
 * Per user direction we're shipping without it; flipping this flag back to
 * `true` (and uncommenting `<MoodEngineHost />` in app/_layout.tsx) brings
 * the full code path back without touching the engine, store, or detector.
 *
 * The three shipped tiers are:
 *   1. Daily mood prompt          (fixed time of day)
 *   2. Friend check-in            (recurring every N min, user-set)
 *   3. Auto-change in background  (~30-min cadence, time of day; steps are
 *                                  iOS-only and unused on Android)
 */
const CAMERA_FEATURE_ENABLED = false;

/**
 * Mood Home — entry point for the mood-driven auto-shuffle feature.
 *
 * Mood Mode (premium): toggle on, pick a Collection → the global
 * `MoodEngineHost` runs a hidden front camera, scans every 60 s while the
 * app is foregrounded, and auto-changes the wallpaper to a photo from the
 * chosen Collection whose hash bucket matches the detected mood.
 *
 * Manual emoji buttons (free): tap to force-apply a wallpaper from the
 * current pool that matches the tapped mood. Works whether Mode is on or
 * off, but needs an active Collection — otherwise tapping just navigates
 * to the mood preview grid.
 */
export default function MoodHome() {
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const hydrated = useMoodStore((s) => s.hydrated);
  const currentMood = useMoodStore((s) => s.currentMood);
  const lastSource = useMoodStore((s) => s.lastSource);
  const lastConfidence = useMoodStore((s) => s.lastConfidence);
  const history = useMoodStore((s) => s.history);
  const historyCount = history.length;
  // Most recent per-source timestamps, derived from the unified history list.
  const lastCameraAt = useMemo(
    () => history.find((h) => h.source === 'camera')?.at ?? null,
    [history],
  );
  const lastBgAt = useMemo(
    () => history.find((h) => h.source === 'background')?.at ?? null,
    [history],
  );
  const lastNotifAt = useMemo(
    () => history.find((h) => h.source === 'notification')?.at ?? null,
    [history],
  );
  const moodModeEnabled = useMoodStore((s) => s.moodModeEnabled);
  const moodCollectionId = useMoodStore((s) => s.moodCollectionId);
  const currentPhotoId = useMoodStore((s) => s.currentPhotoId);
  const backgroundEnabled = useMoodStore((s) => s.backgroundEnabled);
  const rotateWithinMood = useMoodStore((s) => s.rotateWithinMood);
  const setRotateWithinMood = useMoodStore((s) => s.setRotateWithinMood);
  const notifEnabled = useMoodStore((s) => s.notifEnabled);
  const notifHour = useMoodStore((s) => s.notifHour);
  const friendCheckInEnabled = useMoodStore((s) => s.friendCheckInEnabled);
  const friendCheckInMinutes = useMoodStore((s) => s.friendCheckInMinutes);
  const sleepWakeEnabled = useMoodStore((s) => s.sleepWakeEnabled);
  const sleepWakePackId = useMoodStore((s) => s.sleepWakePackId);
  const sleepWakeWakeHour = useMoodStore((s) => s.sleepWakeWakeHour);
  const sleepWakeSleepHour = useMoodStore((s) => s.sleepWakeSleepHour);
  const sleepWakeCustomWakeId = useMoodStore((s) => s.sleepWakeCustomWakeId);
  const sleepWakeCustomSleepId = useMoodStore((s) => s.sleepWakeCustomSleepId);
  const selectMoodManual = useMoodStore((s) => s.selectMoodManual);
  const setMoodModeEnabled = useMoodStore((s) => s.setMoodModeEnabled);
  const setCurrentMoodPhoto = useMoodStore((s) => s.setCurrentMoodPhoto);
  const setBackgroundEnabled = useMoodStore((s) => s.setBackgroundEnabled);
  const setNotifEnabled = useMoodStore((s) => s.setNotifEnabled);
  const setNotifHour = useMoodStore((s) => s.setNotifHour);
  const setFriendCheckInEnabled = useMoodStore((s) => s.setFriendCheckInEnabled);
  const setFriendCheckInMinutes = useMoodStore((s) => s.setFriendCheckInMinutes);
  const setSleepWakeEnabled = useMoodStore((s) => s.setSleepWakeEnabled);
  const setSleepWakePackId = useMoodStore((s) => s.setSleepWakePackId);
  const setSleepWakeWakeHour = useMoodStore((s) => s.setSleepWakeWakeHour);
  const setSleepWakeSleepHour = useMoodStore((s) => s.setSleepWakeSleepHour);
  const setSleepWakeCustomWakeId = useMoodStore((s) => s.setSleepWakeCustomWakeId);
  const setSleepWakeCustomSleepId = useMoodStore((s) => s.setSleepWakeCustomSleepId);
  const setMoodCollection = useMoodStore((s) => s.setMoodCollection);

  const collections = useCollections();
  // For the long-press in-place album picker (introduced changes/053).
  // Materializes a built-in theme pack as a Collection WITHOUT activating
  // it as the shuffle — see comment on the matching selector in
  // app/mood/pick-collection.tsx for why this matters.
  const ensureBuiltinPackCollection = useShuffleStore(
    (s) => s.ensureBuiltinPackCollection,
  );
  const createCollection = useShuffleStore((s) => s.createCollection);
  const updateCollection = useShuffleStore((s) => s.updateCollection);
  const canAddCollection = useShuffleStore((s) => s.canAddCollection);
  const hasMood = useEntitlement('mood');

  const [busy, setBusy] = useState(false);
  // When the toggle handler pushed the user to /mood/pick-collection because
  // no pool was set, we remember that intent so picking a pool auto-completes
  // the toggle-on flow — no more "tap toggle, get pushed away, come back and
  // tap toggle again" 2-step dance (Bug C).
  const [resumeToggle, setResumeToggle] = useState(false);
  // Custom-minutes bottom-sheet for the friend check-in.
  const customIntervalSheetRef = useRef<BottomSheetModal>(null);
  const [customMinInput, setCustomMinInput] = useState('');
  // Sleep/Wake pack-picker bottom-sheet.
  const swPackPickerRef = useRef<BottomSheetModal>(null);
  // Custom-pair picker bottom-sheet (browses photos, tap to assign as
  // wake or sleep).
  const swCustomPickerRef = useRef<BottomSheetModal>(null);
  // URL-input bottom-sheet for the "From Internet" Custom action
  // (changes/054). The album selector itself is rendered inline at the
  // bottom of the page — no sheet needed for it.
  const urlSheetRef = useRef<BottomSheetModal>(null);
  const [urlInput, setUrlInput] = useState('');

  const activeSleepWakePack = useMemo(
    () => getSleepWakePack(sleepWakePackId),
    [sleepWakePackId],
  );
  const isCustomSleepWake = sleepWakePackId === CUSTOM_SLEEP_WAKE_ID;

  /** Photo pool for the custom-pair picker — pull a handful from each
   *  mood so the picker has variety without being overwhelming. */
  const customPhotoPool = useMemo(() => {
    const moods = ['happy', 'sad', 'angry', 'calm', 'excited', 'surprised', 'neutral'];
    return moods.flatMap((m) => getMoodPhotos(m, 6));
  }, []);

  /** Pixel width per cell in the custom-pair picker grid. The bottom-sheet
   *  has horizontal padding from `PremiumSheet.content` (Spacing.lg = 16
   *  per side) so usable width = screen width − 32. Three columns with
   *  6 px gaps between them: usable − 2*6 / 3. */
  const customCellWidth = useMemo(() => {
    const sheetUsable = width - Spacing.lg * 2;
    return Math.floor((sheetUsable - 6 * 2) / 3);
  }, [width]);

  useEffect(() => {
    if (!hydrated) hydrateMoodStore();
  }, [hydrated]);

  // Defensive re-sync from AsyncStorage on tab mount + every AppState
  // resume. Covers the case where a notification handler (Friend Check-in
  // / Daily Prompt) ran while the React process was DEAD, wrote the new
  // mood + photo + history entry to AsyncStorage, and the user later
  // re-opens the app — without this, the live in-memory store would still
  // show the pre-notification state because `hydrate` is one-shot.
  useEffect(() => {
    const resync = () => useMoodStore.getState().resyncFromStorage();
    resync();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') resync();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!resumeToggle) return;
    if (!moodCollectionId) return;        // still waiting for pick
    if (moodModeEnabled) {                // already on — nothing to do
      setResumeToggle(false);
      return;
    }
    // The user picked a pool after we sent them to the picker — finish the
    // turn-on now without making them tap the toggle again.
    setResumeToggle(false);
    (async () => {
      await setMoodModeEnabled(true);
      toast('✓ Mood Mode on — camera scanning');
    })();
  }, [resumeToggle, moodCollectionId, moodModeEnabled, setMoodModeEnabled]);

  const activeMood = getMoodOrDefault(currentMood);
  const activeCollection = useMemo(
    () => collections.find((c) => c.id === moodCollectionId) ?? null,
    [collections, moodCollectionId],
  );
  // currentPhoto can come from FOUR sources, resolved in priority order:
  //   1. Gallery URI (file:// / content://) — the user's own picked photo
  //      via the Sleep/Wake custom-pair gallery option.
  //   2. Curated Sleep/Wake pack ID (sw-…)  — from getSleepWakePhoto.
  //   3. Mock-catalog ID (mood-happy-3, pink-lolita-0, …) — getPhotoById.
  const currentPhoto = useMemo(() => {
    if (!currentPhotoId) return null;
    if (currentPhotoId.startsWith('file://') || currentPhotoId.startsWith('content://')) {
      return {
        id: currentPhotoId,
        image: currentPhotoId,
        title: 'My gallery photo',
      };
    }
    return getSleepWakePhoto(currentPhotoId) ?? getPhotoById(currentPhotoId);
  }, [currentPhotoId]);
  const tally = useMemo(
    () => (activeCollection ? tallyMoodBuckets(activeCollection.photoIds) : null),
    [activeCollection],
  );

  const btnSize = Math.floor(
    (width - SIDE * 2 - GAP * (MANUAL_MOOD_IDS.length - 1)) /
      MANUAL_MOOD_IDS.length,
  );

  // ─── Toggle Mood Mode ────────────────────────────────────────────────────
  const onToggleMode = useCallback(() => {
    if (moodModeEnabled) {
      // Turning OFF — no permission/premium dance needed.
      setMoodModeEnabled(false);
      toast('Mood Mode paused');
      return;
    }

    gateFeature('mood', async () => {
      setBusy(true);
      try {
        // 1) Permission
        let p = await getCameraPermission();
        if (p.moduleMissing) {
          premiumAlert({
            title: 'Camera not installed',
            message: 'expo-camera needs a native rebuild. Run `npx expo run:android` (or run:ios) and reopen.',
            icon: 'construct-outline',
          });
          return;
        }
        if (!p.granted) {
          if (!p.canAskAgain) {
            premiumAlert({
              title: 'Camera access blocked',
              message: 'Open Settings to allow camera access for mood detection.',
              icon: 'lock-closed',
              buttons: [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            });
            return;
          }
          p = await requestCameraPermission();
          if (!p.granted) {
            toast('Camera permission needed');
            return;
          }
        }

        // 2) Collection
        if (!moodCollectionId) {
          setResumeToggle(true);
          router.push('/mood/pick-collection' as Href);
          toast('Pick a pool — Mood Mode turns on after you pick');
          return;
        }

        // 3) Activate
        await setMoodModeEnabled(true);
        toast('✓ Mood Mode on — camera scanning');
      } finally {
        setBusy(false);
      }
    });
  }, [moodModeEnabled, moodCollectionId, setMoodModeEnabled, router]);

  // ─── Toggle Background (camera-free, runs while app is closed) ───────────
  const onToggleBackground = useCallback(async () => {
    if (backgroundEnabled) {
      await setBackgroundEnabled(false);
      toast('Background mood off');
      return;
    }
    gateFeature('mood', async () => {
      if (!moodCollectionId) {
        router.push('/mood/pick-collection' as Href);
        toast('Pick a pool first, then turn this on');
        return;
      }
      // Probe the step-signal status BEFORE enabling so the toast tells the
      // user the TRUTH about whether walking influences their wallpaper.
      // On Android the answer is always 'unsupported' — the historical-step
      // read API is iOS-only (see lib/stepCount.ts), so the bg task runs on
      // time-of-day alone. `ensureMotionPermission()` is a no-op on Android
      // (no scary motion-permission prompt for a feature that can't use it);
      // on iOS it requests the permission the working step read needs.
      await ensureMotionPermission();
      const stepStatus = await getStepStatus();
      // Mutual exclusivity — enabling Mood-based stops every other continuous
      // driver (Theme shuffle + Friend check-in) via the bootstrap subscriber →
      // `enforceSingleDriver`. Confirm BEFORE the flip so the pause is never
      // silent (changes/189); the dialog names what gets paused, so the toast
      // no longer repeats it. Runs immediately (no dialog) when nothing else
      // is active.
      confirmDriverSwitch({
        keep: 'mood',
        enablingLabel: 'Mood-based',
        onConfirm: () => void enableBackgroundMood(stepStatus),
      });
    });
  }, [backgroundEnabled, moodCollectionId, setBackgroundEnabled, router]);

  /** Flip Mood-based on and toast its step-tracking reality. Split out of
   *  `onToggleBackground` so the exclusivity confirm can defer it. */
  const enableBackgroundMood = useCallback(
    async (stepStatus: Awaited<ReturnType<typeof getStepStatus>>) => {
      await setBackgroundEnabled(true);
      const baseMsg = 'Background mood on — runs every 30 min';
      switch (stepStatus) {
        case 'available':
          toast(`✓ ${baseMsg} · steps tracking`);
          break;
        case 'no-permission':
          toast(`✓ ${baseMsg} · steps OFF (motion permission denied)`);
          break;
        case 'unsupported':
          // Android (always) + iOS devices with no pedometer. Be honest:
          // walking won't move the wallpaper; it changes by time of day.
          toast(`✓ ${baseMsg} · changes by time of day`);
          break;
        case 'unlinked':
          toast(`✓ ${baseMsg} · steps unavailable in this build`);
          break;
      }
    },
    [setBackgroundEnabled],
  );

  // ─── Toggle photo-variety (rotate within the same mood) ─────────────────
  const onToggleRotateWithinMood = useCallback(async () => {
    const next = !rotateWithinMood;
    await setRotateWithinMood(next);
    toast(next ? '✓ New photo on every check' : '✓ One photo per mood');
  }, [rotateWithinMood, setRotateWithinMood]);

  // ─── Toggle Notification ─────────────────────────────────────────────────
  const onToggleNotif = useCallback(async () => {
    if (notifEnabled) {
      await setNotifEnabled(false);
      toast('Daily notification off');
      return;
    }
    gateFeature('mood', async () => {
      if (!moodCollectionId) {
        router.push('/mood/pick-collection' as Href);
        toast('Pick a pool first');
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        premiumAlert({
          title: 'Notification permission needed',
          message: 'We need permission to send the daily mood prompt.',
          icon: 'notifications-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      await setNotifEnabled(true);
      toast(`✓ Daily prompt at ${formatHour(notifHour)}`);
    });
  }, [notifEnabled, moodCollectionId, notifHour, setNotifEnabled, router]);

  const onChangeNotifHour = useCallback(() => {
    premiumAlert({
      title: 'Daily prompt time',
      message: 'When should we send the mood prompt?',
      icon: 'time-outline',
      buttons: [
        { text: 'Morning (8 AM)', onPress: () => setNotifHour(8) },
        { text: 'Lunch (12 PM)', onPress: () => setNotifHour(12) },
        { text: 'Evening (7 PM)', onPress: () => setNotifHour(19) },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [setNotifHour]);

  const onRunBgNow = useCallback(async () => {
    // `runMoodBackgroundOnce` returns a bare boolean and can return false
    // for SEVERAL distinct reasons (disabled, no pool, apply failed, or a
    // genuine no-op). The old toast asserted "No change (same mood)" for
    // every false, which masked real failures. Check the obvious gates here
    // so the user gets the TRUE reason; only the genuine apply-returned-
    // false case shows a neutral "No change yet".
    if (!backgroundEnabled) {
      toast('Turn background on first');
      return;
    }
    if (!moodCollectionId) {
      toast('Pick a pool first');
      return;
    }
    const ok = await runMoodBackgroundOnce();
    toast(ok ? '✓ Wallpaper refreshed' : 'No change yet — try again shortly');
  }, [backgroundEnabled, moodCollectionId]);

  // Force an immediate camera scan — used by the "Scan now" button so the
  // user can verify the engine without waiting the 60 s cadence.
  const onScanNow = useCallback(async () => {
    if (!moodModeEnabled) {
      toast('Turn Mood Mode on first');
      return;
    }
    const r = await triggerImmediateMoodScan();
    switch (r.status) {
      case 'ok':
        toast('✓ Scan done — wallpaper updated');
        break;
      case 'not-ready':
        toast('Camera warming up — try again in 2 s');
        break;
      case 'failed':
        // Surface the underlying error (e.g. "Camera is in use", "No image
        // data") instead of pretending it's a permission issue.
        toast(`Scan failed: ${r.error}`);
        break;
      case 'no-engine':
        toast('Engine off — toggle Mood Mode on, then try again');
        break;
    }
  }, [moodModeEnabled]);

  // ─── Friend check-in — "be a friend who asks how you feel" ──────────────
  const onToggleFriend = useCallback(async () => {
    if (friendCheckInEnabled) {
      await setFriendCheckInEnabled(false);
      toast('Friend check-in off');
      return;
    }
    gateFeature('mood', async () => {
      if (!moodCollectionId) {
        router.push('/mood/pick-collection' as Href);
        toast('Pick a pool first');
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        premiumAlert({
          title: 'Notifications needed',
          message: 'I’ll send you a friendly mood check on a schedule — tap a feeling and your wallpaper updates.',
          icon: 'notifications-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      // Mutual exclusivity: enabling Friend check-in stops every other
      // continuous driver (Theme shuffle + Mood-based) via the bootstrap
      // subscriber → `enforceSingleDriver`. Capture what's running BEFORE
      // the flip so the toast can name what got paused.
      const pausedOthers = otherActiveDriverLabels('friend');
      await setFriendCheckInEnabled(true);
      // Don't trust the bootstrap subscriber's silent reschedule — call
      // the scheduler directly and toast its real result. If the host
      // SDK is missing `SchedulableTriggerInputTypes.TIME_INTERVAL` (or
      // `scheduleNotificationAsync` throws), the subscriber path
      // returned false silently and the user got a "✓ I'll check in"
      // toast that wasn't true. Confirmed root cause for the
      // "friend notification not working" complaint.
      const ok = await scheduleFriendCheckInNotification(friendCheckInMinutes);
      if (ok) {
        const base = `✓ I’ll check in every ${formatMinutes(friendCheckInMinutes)}`;
        toast(
          pausedOthers.length
            ? `${base} · ${pausedOthers.join(' + ')} paused`
            : base,
        );
      } else {
        // Roll the toggle back so the UI doesn't lie.
        await setFriendCheckInEnabled(false);
        premiumAlert({
          title: 'Couldn’t schedule check-in',
          message:
            'Your device blocked the recurring notification. Open Settings → Notifications and allow scheduled notifications for Kawaii Baby, then try again.',
          icon: 'alert-circle-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
      }
    });
  }, [
    friendCheckInEnabled,
    friendCheckInMinutes,
    moodCollectionId,
    setFriendCheckInEnabled,
    router,
  ]);

  const openCustomIntervalSheet = useCallback(() => {
    setCustomMinInput(String(friendCheckInMinutes));
    customIntervalSheetRef.current?.present();
  }, [friendCheckInMinutes]);

  const onPickFriendInterval = useCallback(() => {
    const presetOpts = FRIEND_CHECK_IN_PRESETS.map((mins) => ({
      text: formatMinutes(mins),
      onPress: () => setFriendCheckInMinutes(mins),
    }));
    premiumAlert({
      title: 'Check in every…',
      message: 'How often should I ask?',
      icon: 'time',
      accentColor: Colors.cyan,
      buttons: [
        ...presetOpts,
        { text: 'Custom…', onPress: openCustomIntervalSheet },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [setFriendCheckInMinutes, openCustomIntervalSheet]);

  // ─── Sleep/Wake handlers ────────────────────────────────────────────────
  const onToggleSleepWake = useCallback(async () => {
    if (sleepWakeEnabled) {
      await setSleepWakeEnabled(false);
      toast('Sleep/Wake off');
      return;
    }
    gateFeature('mood', async () => {
      if (!sleepWakePackId) {
        swPackPickerRef.current?.present();
        toast('Pick a pack first');
        return;
      }
      const granted = await ensureNotificationPermission();
      if (!granted) {
        premiumAlert({
          title: 'Notifications needed',
          message:
            'I’ll send a Good Morning ☀️ and Sleep Well 🌙 notification at your chosen times — tap to apply the wallpaper.',
          icon: 'notifications-outline',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      await setSleepWakeEnabled(true);
      toast('✓ Sleep/Wake on');
    });
  }, [sleepWakeEnabled, sleepWakePackId, setSleepWakeEnabled]);

  const onPickSleepWakePack = useCallback(() => {
    swPackPickerRef.current?.present();
  }, []);

  // ─── Bottom "Switch album" strip (changes/054) ──────────────────────
  // Always-visible row at the bottom of the Mood Home scroll. Replaced
  // the long-press picker from changes/053 — that gesture wasn't
  // discoverable. Now every album is one tap away; a Custom card at the
  // end gives the user the choice to pull a photo from gallery or from
  // an internet URL without leaving the screen.
  type AlbumRow =
    | { kind: 'collection'; id: string; name: string; thumb: string; count: number }
    | {
        kind: 'pack';
        existingId: string | null;
        seedPackId: string;
        name: string;
        thumb: string;
        count: number;
        photoIds: string[];
      };

  const albumRows = useMemo<AlbumRow[]>(() => {
    const userRows: AlbumRow[] = collections
      .filter((c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'mood')
      .map((c) => ({
        kind: 'collection' as const,
        id: c.id,
        name: c.name,
        thumb: getPhotoById(c.photoIds[0])?.image ?? '',
        count: c.photoIds.length,
      }));
    const packRows: AlbumRow[] = moodAlbums.map((p) => {
      const existing = collections.find((c) => c.seedPackId === p.id);
      const photoIds =
        existing?.photoIds ?? getThemePackPhotos(p.id, 10).map((x) => x.id);
      return {
        kind: 'pack' as const,
        existingId: existing?.id ?? null,
        seedPackId: p.id,
        name: p.title,
        thumb: getThemePackPhotos(p.id, 1)[0]?.image ?? p.thumbs[0],
        count: existing?.photoIds.length ?? photoIds.length,
        photoIds,
      };
    });
    return [...userRows, ...packRows];
  }, [collections]);

  const onPickAlbum = useCallback(
    async (row: AlbumRow) => {
      let cid: string;
      if (row.kind === 'collection') {
        cid = row.id;
      } else if (row.existingId) {
        cid = row.existingId;
      } else {
        // ensureBuiltinPackCollection — materialize without activating as
        // shuffle (see comment on the selector declaration above).
        cid = ensureBuiltinPackCollection(row.seedPackId, row.name, row.photoIds);
      }
      await setMoodCollection(cid);
      toast(`✓ Mood pool: ${row.name}`);
    },
    [ensureBuiltinPackCollection, setMoodCollection],
  );

  /**
   * Add one or more user-supplied photo URIs (gallery or downloaded
   * internet URLs) to the user's "My custom" mood pool.
   *
   * Behavior:
   *   - If the user has at least one custom mood-purpose collection,
   *     append to the first one. If it would exceed COLLECTION_SIZE,
   *     evict the OLDEST photos (sliding window) so newer additions
   *     always win without forcing manual pool management.
   *   - Otherwise create a fresh "My custom" mood collection, but only
   *     if the free-tier budget allows; otherwise gate with premium.
   *
   * Returns the number of photos actually added (capped + de-duplicated).
   * Sets the resulting collection as the active mood pool so the next
   * notification / bg-tick picks from it.
   */
  const addPhotosToCustomMoodPool = useCallback(
    async (uris: string[]): Promise<number> => {
      if (uris.length === 0) return 0;
      const existing = collections.find(
        (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'mood',
      );
      let cid: string;
      if (existing) {
        cid = existing.id;
        // Strip dupes the incoming list and any already-present in the
        // existing pool, then append to the end (newest wins under cap).
        const incomingDedup = Array.from(new Set(uris));
        const without = existing.photoIds.filter(
          (p) => !incomingDedup.includes(p),
        );
        const merged = [...without, ...incomingDedup].slice(-COLLECTION_SIZE);
        updateCollection(cid, { photoIds: merged });
        await setMoodCollection(cid);
        return Math.min(incomingDedup.length, COLLECTION_SIZE);
      }
      if (!canAddCollection(hasMood, 'mood')) {
        gateFeature('mood', () => {});
        return 0;
      }
      const c = createCollection('My custom mood', 'mood');
      cid = c.id;
      const dedup = Array.from(new Set(uris)).slice(0, COLLECTION_SIZE);
      updateCollection(cid, { photoIds: dedup });
      await setMoodCollection(cid);
      return dedup.length;
    },
    [
      collections,
      updateCollection,
      createCollection,
      canAddCollection,
      hasMood,
      setMoodCollection,
    ],
  );

  /** How many free slots remain in the user's custom mood pool. */
  const customPoolRemaining = useMemo(() => {
    const existing = collections.find(
      (c) => !c.seedPackId && (c.purpose ?? 'shuffle') === 'mood',
    );
    return COLLECTION_SIZE - (existing?.photoIds.length ?? 0);
  }, [collections]);

  const onPickFromGalleryForCustom = useCallback(async () => {
    // Wrapped in try/catch so any unhandled rejection (Vivo OEM picker
    // throwing, OOM mid-pick, etc.) surfaces as a toast instead of an
    // uncaught error that could trip React's error boundary or escalate
    // into an activity recreation loop. The picker call itself returns
    // a discriminated result, but addPhotosToCustomMoodPool +
    // setAsWallpaper can throw on bad URIs / native module hiccups.
    try {
      const limit = Math.max(1, customPoolRemaining || COLLECTION_SIZE);
      const r = await pickGalleryImages({ limit });
      if (!r.ok || r.uris.length === 0) {
        if (r.reason === 'denied') toast('Gallery permission denied');
        else if (r.reason === 'module_missing')
          toast('Gallery picker unavailable in this build');
        else if (r.reason !== 'cancelled')
          toast('Could not pick from gallery — try one photo at a time');
        return;
      }
      const added = await addPhotosToCustomMoodPool(r.uris);
      if (added <= 0) return;
      // Instant-apply the FIRST picked photo so the user gets immediate
      // visual feedback. Without this, photos land in the pool but the
      // wallpaper only changes on the next mood-notification tap or
      // bg-task dispatch — which the user reads as "didn't apply
      // perfectly." Errors here are surfaced but don't roll back the
      // pool addition (those photos are still in the user's album).
      const firstUri = r.uris[0];
      try {
        const ar = await setAsWallpaper(firstUri, `custom-mood-${Date.now()}`, 'both');
        toast(
          ar.ok
            ? added === 1
              ? '✓ Added 1 photo · applied as wallpaper'
              : `✓ Added ${added} photos · first one applied`
            : `Added ${added} · couldn't apply (${ar.message})`,
        );
      } catch (applyErr) {
        console.warn('[mood/custom] setAsWallpaper threw:', applyErr);
        toast(`Added ${added} photos · apply failed`);
      }
    } catch (e) {
      console.warn('[mood/custom] gallery flow crashed:', e);
      toast('Gallery pick failed — please retry');
    }
  }, [addPhotosToCustomMoodPool, customPoolRemaining]);

  const onOpenUrlSheet = useCallback(() => {
    setUrlInput('');
    urlSheetRef.current?.present();
  }, []);

  const onSaveUrlPhoto = useCallback(async () => {
    // Accept multiple URLs separated by newlines OR commas so the user
    // can paste a batch from their browser history at once. Each URL is
    // validated + downloaded in parallel; failures are toasted with a
    // count so the user can see exactly how many succeeded. Wrapped in
    // try/catch for the same reason as the gallery flow.
    try {
      const raw = urlInput.trim();
      if (!raw) return;
      const urls = raw
        .split(/[\s,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);
      if (urls.length === 0) return;
      toast(
        urls.length === 1
          ? 'Downloading…'
          : `Downloading ${urls.length} images…`,
      );
      const results = await Promise.all(
        urls.map((u) => downloadInternetImage(u)),
      );
      const okUris = results
        .filter((r) => r.ok && r.uri)
        .map((r) => r.uri as string);
      const invalidCount = results.filter(
        (r) => !r.ok && r.reason === 'invalid_url',
      ).length;
      const failedCount = results.filter(
        (r) => !r.ok && r.reason === 'download_failed',
      ).length;
      if (okUris.length === 0) {
        toast(
          invalidCount > 0
            ? 'No valid http(s) URLs found'
            : 'All downloads failed',
        );
        return;
      }
      const added = await addPhotosToCustomMoodPool(okUris);
      if (added <= 0) return;
      setUrlInput('');
      urlSheetRef.current?.dismiss();
      // Instant-apply the first downloaded image so the user sees their
      // pick immediately. Same rationale as the gallery flow above.
      const failedMsg =
        invalidCount + failedCount > 0
          ? ` (${invalidCount + failedCount} failed)`
          : '';
      try {
        const ar = await setAsWallpaper(
          okUris[0],
          `custom-mood-${Date.now()}`,
          'both',
        );
        toast(
          ar.ok
            ? added === 1
              ? `✓ Added 1 · applied as wallpaper${failedMsg}`
              : `✓ Added ${added} · first one applied${failedMsg}`
            : `Added ${added}${failedMsg} · couldn't apply (${ar.message})`,
        );
      } catch (applyErr) {
        console.warn('[mood/custom] URL setAsWallpaper threw:', applyErr);
        toast(`Added ${added}${failedMsg} · apply failed`);
      }
    } catch (e) {
      console.warn('[mood/custom] URL flow crashed:', e);
      toast('URL download failed — please retry');
    }
  }, [urlInput, addPhotosToCustomMoodPool]);

  const onPickCustom = useCallback(() => {
    premiumAlert({
      title: 'Add to your custom mood pool',
      message:
        'Pick a photo from your gallery or paste any image URL from your browser.',
      icon: 'add-circle-outline',
      buttons: [
        { text: 'From Gallery', onPress: onPickFromGalleryForCustom },
        { text: 'From Internet', onPress: onOpenUrlSheet },
        {
          text: 'Build full album…',
          onPress: () => router.push('/mood/pick-collection' as Href),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [onPickFromGalleryForCustom, onOpenUrlSheet, router]);

  const onPickCustomPair = useCallback(() => {
    swPackPickerRef.current?.dismiss();
    setTimeout(() => swCustomPickerRef.current?.present(), 240);
  }, []);

  /**
   * Tap a photo in the custom-pair picker. Three-state machine:
   *   no slots filled  → tap fills WAKE
   *   wake filled only → tap fills SLEEP
   *   both filled      → tap REPLACES the slot it was the most recent fill
   *                      of (which is sleep, by definition of getting here)
   *                      with the new pick. Wake stays.
   * Re-tapping a photo that's ALREADY in a slot clears that slot.
   */
  const onTapCustomPhoto = useCallback(
    (photoId: string) => {
      const isWake = sleepWakeCustomWakeId === photoId;
      const isSleep = sleepWakeCustomSleepId === photoId;
      if (isWake) {
        setSleepWakeCustomWakeId(null);
        return;
      }
      if (isSleep) {
        setSleepWakeCustomSleepId(null);
        return;
      }
      if (!sleepWakeCustomWakeId) {
        setSleepWakeCustomWakeId(photoId);
        return;
      }
      if (!sleepWakeCustomSleepId) {
        setSleepWakeCustomSleepId(photoId);
        return;
      }
      // Both filled — replace the SLEEP slot (latest filled).
      setSleepWakeCustomSleepId(photoId);
    },
    [
      sleepWakeCustomWakeId,
      sleepWakeCustomSleepId,
      setSleepWakeCustomWakeId,
      setSleepWakeCustomSleepId,
    ],
  );

  /**
   * Open the system gallery and ask the user which slot the picked
   * photo should fill. If only one slot is empty, fill it directly
   * without asking.
   */
  const onPickFromGallery = useCallback(async () => {
    const r = await pickGalleryImage();
    if (!r.ok) {
      if (r.reason === 'cancelled') return;
      if (r.reason === 'module_missing') {
        premiumAlert({
          title: 'Needs a native rebuild',
          message:
            'expo-image-picker isn’t linked yet. Run `npx expo run:android` and reopen.',
          icon: 'construct-outline',
        });
        return;
      }
      if (r.reason === 'denied') {
        premiumAlert({
          title: 'Gallery access needed',
          message:
            'Allow photo library access to pick your own wake-up and sleep wallpapers.',
          icon: 'lock-closed',
          buttons: [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        });
        return;
      }
      toast('Couldn’t open gallery');
      return;
    }

    const uri = r.uri!;
    const wakeEmpty = !sleepWakeCustomWakeId;
    const sleepEmpty = !sleepWakeCustomSleepId;

    if (wakeEmpty && !sleepEmpty) {
      // Only wake slot empty — fill it without asking.
      await setSleepWakeCustomWakeId(uri);
      toast('✓ Set as ☀️ Wake');
      return;
    }
    if (sleepEmpty && !wakeEmpty) {
      await setSleepWakeCustomSleepId(uri);
      toast('✓ Set as 🌙 Sleep');
      return;
    }
    // Both empty OR both filled — ask which slot.
    premiumAlert({
      title: 'Use this photo as…',
      icon: 'image-outline',
      buttons: [
        {
          text: '☀️ Wake (morning)',
          onPress: async () => {
            await setSleepWakeCustomWakeId(uri);
            toast('✓ Set as ☀️ Wake');
          },
        },
        {
          text: '🌙 Sleep (night)',
          onPress: async () => {
            await setSleepWakeCustomSleepId(uri);
            toast('✓ Set as 🌙 Sleep');
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [
    sleepWakeCustomWakeId,
    sleepWakeCustomSleepId,
    setSleepWakeCustomWakeId,
    setSleepWakeCustomSleepId,
  ]);

  const onSaveCustomPair = useCallback(async () => {
    if (!sleepWakeCustomWakeId || !sleepWakeCustomSleepId) {
      toast('Pick one Wake and one Sleep image');
      return;
    }
    await setSleepWakePackId(CUSTOM_SLEEP_WAKE_ID);
    swCustomPickerRef.current?.dismiss();
    setTimeout(() => toast('✓ Custom pair saved'), 240);
  }, [sleepWakeCustomWakeId, sleepWakeCustomSleepId, setSleepWakePackId]);

  const onPickWakeHour = useCallback(() => {
    // Guard: wake hour must differ from sleep hour. Equal hours collapse
    // the sleep/wake windows in runSleepWakeFallback (sleep never fires,
    // wake fires daily) — see the degenerate guard there. Ignore + toast
    // rather than persisting a broken schedule.
    const pickWake = (h: number) => {
      if (h === sleepWakeSleepHour) {
        toast('Wake time can’t equal sleep time');
        return;
      }
      setSleepWakeWakeHour(h);
    };
    premiumAlert({
      title: 'Wake-up time',
      message: 'When should ☀️ Good Morning fire?',
      icon: 'sunny',
      buttons: [
        { text: '6 AM', onPress: () => pickWake(6) },
        { text: '7 AM', onPress: () => pickWake(7) },
        { text: '8 AM', onPress: () => pickWake(8) },
        { text: '9 AM', onPress: () => pickWake(9) },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [setSleepWakeWakeHour, sleepWakeSleepHour]);

  const onPickSleepHour = useCallback(() => {
    // Same guard as wake: sleep hour must differ from wake hour.
    const pickSleep = (h: number) => {
      if (h === sleepWakeWakeHour) {
        toast('Sleep time can’t equal wake time');
        return;
      }
      setSleepWakeSleepHour(h);
    };
    premiumAlert({
      title: 'Sleep time',
      message: 'When should 🌙 Sleep Well fire?',
      icon: 'moon',
      buttons: [
        { text: '9 PM', onPress: () => pickSleep(21) },
        { text: '10 PM', onPress: () => pickSleep(22) },
        { text: '11 PM', onPress: () => pickSleep(23) },
        { text: '12 AM', onPress: () => pickSleep(0) },
        { text: 'Cancel', style: 'cancel' },
      ],
    });
  }, [setSleepWakeSleepHour, sleepWakeWakeHour]);

  const saveCustomInterval = useCallback(() => {
    const trimmed = customMinInput.trim();
    const n = parseInt(trimmed, 10);
    if (!Number.isFinite(n) || n < 1) {
      toast('Enter a number 1–1440');
      return;
    }
    if (n > 1440) {
      toast('Max is 1440 (24 h) — use Daily Mood Prompt for once-a-day');
      return;
    }
    setFriendCheckInMinutes(n);
    customIntervalSheetRef.current?.dismiss();
    // Tell the user the truth about Android's WorkManager floor —
    // but only when the FGS isn't available. With the FGS linked the
    // tick runs on our own Handler, bypassing AlarmManager/WorkManager
    // entirely, so sub-15-min intervals fire on time.
    setTimeout(() => {
      if (n < FRIEND_CHECK_IN_ANDROID_FLOOR && !isFriendCheckinForegroundAvailable) {
        toast(`Set to ${n} min · Android may round up to ${FRIEND_CHECK_IN_ANDROID_FLOOR}`);
      } else {
        toast(`✓ Set to ${formatMinutes(n)}`);
      }
    }, 240);
  }, [customMinInput, setFriendCheckInMinutes]);

  // ─── Manual emoji tap ────────────────────────────────────────────────────
  const onSelectMood = useCallback(
    async (id: MoodId) => {
      if (!activeCollection) {
        // No pool yet — record the manual selection (the preview grid is the
        // user's chosen mood) and fall back to the preview grid for that mood.
        await selectMoodManual(id);
        router.push(`/mood/${id}` as Href);
        return;
      }
      // Force-apply a wallpaper from the active Collection's bucket. Only
      // commit the manual mood to the store AFTER a successful apply —
      // otherwise the header would flip to the new mood while the wallpaper
      // (and currentPhotoId) stay on the old one when the apply fails.
      const r = await applyMoodPhotoFromCollection(id, activeCollection.id, currentPhotoId);
      if (r.ok && r.photoId) {
        await selectMoodManual(id);
        await setCurrentMoodPhoto(r.photoId);
        toast(`✓ ${MOOD_BY_ID[id].label} wallpaper applied`);
      } else {
        toast(r.message);
      }
    },
    [selectMoodManual, activeCollection, currentPhotoId, setCurrentMoodPhoto, router],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]} edges={['top']}>
      <StatusBar style="light" />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: theme.text }]}>Mood Based</Text>
            <Text style={styles.subtitle}>
              Auto-changes wallpapers to match how you feel
            </Text>
          </View>
          <AnimatedButton
            onPress={() => router.push('/mood/history' as Href)}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name="time-outline" size={20} color={theme.text} />
            {historyCount > 0 ? (
              <View
                style={[styles.iconDot, { backgroundColor: theme.primary }]}
              />
            ) : null}
          </AnimatedButton>
        </View>

        {/* ─── CURRENTLY APPLIED — always visible so user sees the most
             recent wallpaper regardless of which tier set it. */}
        {currentPhoto ? (
          <View style={styles.modeWrap}>
            <AnimatedButton
              onPress={() => router.push(`/wallpaper/${currentPhoto.id}` as Href)}
              style={[styles.appliedCard, { borderColor: activeMood.tint + '66' }]}
            >
              <Image
                source={{ uri: currentPhoto.image }}
                style={styles.appliedCardThumb}
                contentFit="cover"
                transition={120}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.appliedLabel}>
                  Currently applied · {activeMood.emoji} {activeMood.label}
                </Text>
                <Text style={[styles.appliedTitle, { color: theme.text }]} numberOfLines={1}>
                  {currentPhoto.title}
                </Text>
                <Text style={styles.poolMeta}>
                  {lastSource ? `via ${labelForSource(lastSource)}` : 'tap to view'}
                </Text>
              </View>
              <Ionicons name="open-outline" size={18} color={Colors.textDim} />
            </AnimatedButton>
          </View>
        ) : null}

        {/* ─── MOOD MODE CARD — disabled via CAMERA_FEATURE_ENABLED ─── */}
        {CAMERA_FEATURE_ENABLED ? (
        <Animated.View entering={FadeInDown.duration(280)} style={styles.modeWrap}>
          <View
            style={[
              styles.modeCard,
              moodModeEnabled && {
                borderColor: theme.primary,
                shadowColor: theme.primary,
              },
            ]}
          >
            {/* header row */}
            <View style={styles.modeHead}>
              <View style={styles.modeHeadLeft}>
                <View
                  style={[
                    styles.modeIcon,
                    {
                      backgroundColor: moodModeEnabled
                        ? theme.primary
                        : Colors.surfaceHi,
                    },
                  ]}
                >
                  <Ionicons
                    name={moodModeEnabled ? 'scan' : 'scan-outline'}
                    size={18}
                    color={moodModeEnabled ? '#131313' : Colors.textDim}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.modeTitleRow}>
                    <Text style={[styles.modeTitle, { color: theme.text }]}>
                      Mood Mode
                    </Text>
                    {!hasMood ? <PremiumLock /> : null}
                  </View>
                  <Text style={styles.modeBody}>
                    {moodModeEnabled
                      ? 'Camera ON · scanning every 60s while app is open'
                      : 'Pick a pool, then turn on to auto-detect'}
                  </Text>
                </View>
              </View>

              <AnimatedButton
                onPress={onToggleMode}
                disabled={busy}
                style={[
                  styles.toggleBtn,
                  moodModeEnabled
                    ? { backgroundColor: theme.primary }
                    : { backgroundColor: Colors.surfaceHi },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    moodModeEnabled && styles.toggleKnobOn,
                  ]}
                />
              </AnimatedButton>
            </View>

            {/* collection row — tap navigates to the full picker. The
                bottom "Switch album" strip on this screen lets the user
                swap in place without the navigation round-trip. */}
            <AnimatedButton
              onPress={() => router.push('/mood/pick-collection' as Href)}
              style={styles.poolRow}
            >
              {activeCollection ? (
                <>
                  <View style={styles.poolThumb}>
                    <Image
                      source={{
                        uri:
                          getPhotoById(activeCollection.photoIds[0])?.image ?? '',
                      }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                      transition={80}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poolLabel}>Pool</Text>
                    <Text
                      style={[styles.poolName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {activeCollection.name}
                    </Text>
                    <Text style={styles.poolMeta}>
                      {activeCollection.photoIds.length} photos · tap to change
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View
                    style={[
                      styles.poolThumb,
                      {
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: Colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="add" size={22} color={Colors.textDim} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poolLabel}>Pool</Text>
                    <Text style={[styles.poolName, { color: theme.text }]}>
                      Pick a Collection
                    </Text>
                    <Text style={styles.poolMeta}>
                      Any theme pack or your custom album
                    </Text>
                  </View>
                </>
              )}
              <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
            </AnimatedButton>

            {/* mood balance bar */}
            {tally ? (
              <View style={styles.balanceRow}>
                {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
                  const m = MOOD_BY_ID[mid];
                  const c = tally[mid];
                  return (
                    <View
                      key={mid}
                      style={[
                        styles.balanceCell,
                        c === 0 && { opacity: 0.35 },
                        currentMood === mid && {
                          borderColor: m.tint,
                          backgroundColor: m.tint + '22',
                        },
                      ]}
                    >
                      <Text style={styles.balanceEmoji}>{m.emoji}</Text>
                      <Text style={[styles.balanceCount, { color: m.tint }]}>
                        {c}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* live row */}
            {moodModeEnabled ? (
              <View
                style={[
                  styles.liveRow,
                  { borderColor: activeMood.tint + '55' },
                ]}
              >
                <View
                  style={[
                    styles.liveDot,
                    { backgroundColor: activeMood.tint },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveText}>
                    Detected: <Text style={{ color: activeMood.tint }}>{activeMood.label}</Text>
                    {lastSource === 'camera'
                      ? ` · ${Math.round(lastConfidence * 100)}%`
                      : ''}
                  </Text>
                  <Text style={styles.statusLine}>
                    {lastCameraAt
                      ? `Last camera scan ${timeAgo(lastCameraAt)} · next ~60s`
                      : 'Waiting for first scan (≈ 3 s after camera warm-up)…'}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* currently applied */}
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
                  <Text style={styles.appliedLabel}>Currently applied</Text>
                  <Text style={[styles.appliedTitle, { color: theme.text }]} numberOfLines={1}>
                    {currentPhoto.title}
                  </Text>
                </View>
                <Ionicons name="open-outline" size={16} color={Colors.textDim} />
              </AnimatedButton>
            ) : null}

            {/* Scan-now — dev-only debug affordance to verify the camera
                works without waiting 60 s. Hidden in release builds
                (changes/053). */}
            {__DEV__ && moodModeEnabled ? (
              <AnimatedButton
                onPress={onScanNow}
                style={[styles.testBtn, { borderColor: theme.primary }]}
              >
                <Ionicons name="scan-outline" size={14} color={theme.primary} />
                <Text style={[styles.testBtnText, { color: theme.primary }]}>
                  Scan now
                </Text>
              </AnimatedButton>
            ) : null}

            {/* privacy */}
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
              <Text style={styles.privacyText}>
                Face never stored or sent. Detection pauses when app is closed.
              </Text>
            </View>
          </View>
        </Animated.View>
        ) : null}

        {/* ─── BACKGROUND + NOTIFICATION CARD ─────────────────────────── */}
        <View style={styles.modeWrap}>
          <View
            style={[
              styles.modeCard,
              (backgroundEnabled || notifEnabled) && {
                borderColor: theme.secondary,
                shadowColor: theme.secondary,
              },
            ]}
          >
            <View style={styles.modeHead}>
              <View style={styles.modeHeadLeft}>
                <View
                  style={[
                    styles.modeIcon,
                    {
                      backgroundColor:
                        backgroundEnabled || notifEnabled
                          ? theme.secondary
                          : Colors.surfaceHi,
                    },
                  ]}
                >
                  <Ionicons
                    name="moon-outline"
                    size={18}
                    color={
                      backgroundEnabled || notifEnabled ? '#131313' : Colors.textDim
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.modeTitleRow}>
                    <Text style={[styles.modeTitle, { color: theme.text }]}>
                      Even when app is closed
                    </Text>
                    {!hasMood ? <PremiumLock /> : null}
                  </View>
                  <Text style={styles.modeBody}>
                    Time of day + daily prompt — no camera needed
                  </Text>
                </View>
              </View>
            </View>

            {/* Background toggle row */}
            <View style={styles.subRow}>
              <View style={styles.subRowIcon}>
                <Ionicons name="time-outline" size={16} color={theme.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subRowTitle, { color: theme.text }]}>
                  Auto-change in background
                </Text>
                <Text style={styles.subRowBody}>
                  Runs every ~30 min · changes with the time of day
                </Text>
                {backgroundEnabled ? (
                  <Text style={styles.statusLine}>
                    Last bg run: {timeAgo(lastBgAt)}
                  </Text>
                ) : null}
              </View>
              <AnimatedButton
                onPress={onToggleBackground}
                style={[
                  styles.toggleBtn,
                  backgroundEnabled
                    ? { backgroundColor: theme.secondary }
                    : { backgroundColor: Colors.surfaceHi },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    backgroundEnabled && styles.toggleKnobOn,
                  ]}
                />
              </AnimatedButton>
            </View>

            {/* Photo-variety toggle — only meaningful while background is on.
                OFF (default): one photo per mood, changes only when the mood
                changes. ON: a new photo in the same mood bucket every check. */}
            {backgroundEnabled ? (
              <View style={styles.subRow}>
                <View style={styles.subRowIcon}>
                  <Ionicons name="shuffle-outline" size={16} color={theme.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.subRowTitle, { color: theme.text }]}>
                    Change photo every check
                  </Text>
                  <Text style={styles.subRowBody}>
                    {rotateWithinMood
                      ? 'New photo each time, even for the same mood'
                      : 'One photo per mood — changes only when your mood does'}
                  </Text>
                </View>
                <AnimatedButton
                  onPress={onToggleRotateWithinMood}
                  style={[
                    styles.toggleBtn,
                    rotateWithinMood
                      ? { backgroundColor: theme.secondary }
                      : { backgroundColor: Colors.surfaceHi },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleKnob,
                      rotateWithinMood && styles.toggleKnobOn,
                    ]}
                  />
                </AnimatedButton>
              </View>
            ) : null}

            {/* Notification toggle row */}
            <View style={styles.subRow}>
              <View style={styles.subRowIcon}>
                <Ionicons
                  name="notifications-outline"
                  size={16}
                  color={theme.secondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.subRowTitle, { color: theme.text }]}>
                  Daily mood prompt
                </Text>
                <AnimatedButton onPress={onChangeNotifHour} hitSlop={6}>
                  <Text style={styles.subRowBody}>
                    At {formatHour(notifHour)} · 1-tap apply from buttons
                  </Text>
                </AnimatedButton>
                {notifEnabled ? (
                  <Text style={styles.statusLine}>
                    Next: {nextDailyAt(notifHour)}
                    {lastNotifAt ? ` · last response ${timeAgo(lastNotifAt)}` : ''}
                  </Text>
                ) : null}
              </View>
              <AnimatedButton
                onPress={onToggleNotif}
                style={[
                  styles.toggleBtn,
                  notifEnabled
                    ? { backgroundColor: theme.secondary }
                    : { backgroundColor: Colors.surfaceHi },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    notifEnabled && styles.toggleKnobOn,
                  ]}
                />
              </AnimatedButton>
            </View>

            {/* Dev-only "Run background now" affordance. Hidden in
                release builds (changes/053) — once the bg-task is on,
                the user trusts the OS dispatch + the in-app history
                row to confirm it's working. */}
            {__DEV__ && backgroundEnabled ? (
              <AnimatedButton
                onPress={onRunBgNow}
                style={[styles.testBtn, { borderColor: theme.secondary }]}
              >
                <Ionicons name="flash" size={14} color={theme.secondary} />
                <Text style={[styles.testBtnText, { color: theme.secondary }]}>
                  Run now
                </Text>
              </AnimatedButton>
            ) : null}

            {/* Honest disclosure — kept as a hint for the OEM autostart
                edge case (Vivo/MIUI/ColorOS) where even the foreground
                service can be killed unless the user whitelists the
                app. Default cadence is reliable on stock Android. */}
            <View style={styles.privacyRow}>
              <Ionicons name="information-circle-outline" size={11} color={Colors.textDim} />
              <Text style={styles.privacyText}>
                Runs reliably every ~30 min. On Vivo / Xiaomi / Oppo, allow
                "Autostart" for this app in your phone's battery settings.
              </Text>
            </View>
          </View>
        </View>

        {/* ─── FRIEND CHECK-IN — recurring mood prompt ────────────────── */}
        <View style={styles.modeWrap}>
          <View
            style={[
              styles.modeCard,
              friendCheckInEnabled && {
                borderColor: Colors.cyan,
                shadowColor: Colors.cyan,
              },
            ]}
          >
            <View style={styles.modeHead}>
              <View style={styles.modeHeadLeft}>
                <View
                  style={[
                    styles.modeIcon,
                    {
                      backgroundColor: friendCheckInEnabled
                        ? Colors.cyan
                        : Colors.surfaceHi,
                    },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={18}
                    color={friendCheckInEnabled ? '#131313' : Colors.textDim}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.modeTitleRow}>
                    <Text style={[styles.modeTitle, { color: theme.text }]}>
                      Friend check-in
                    </Text>
                    {!hasMood ? <PremiumLock /> : null}
                  </View>
                  <Text style={styles.modeBody}>
                    I’ll send a friendly notification on a schedule — tap a
                    feeling, your wallpaper changes. Works with the app closed.
                  </Text>
                </View>
              </View>

              <AnimatedButton
                onPress={onToggleFriend}
                style={[
                  styles.toggleBtn,
                  friendCheckInEnabled
                    ? { backgroundColor: Colors.cyan }
                    : { backgroundColor: Colors.surfaceHi },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    friendCheckInEnabled && styles.toggleKnobOn,
                  ]}
                />
              </AnimatedButton>
            </View>

            {/* Interval picker row */}
            <AnimatedButton
              onPress={onPickFriendInterval}
              style={styles.poolRow}
            >
              <View
                style={[
                  styles.poolThumb,
                  {
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: Colors.bgAlt,
                  },
                ]}
              >
                <Ionicons name="time" size={22} color={Colors.cyan} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.poolLabel}>Check-in every</Text>
                <Text
                  style={[styles.poolName, { color: theme.text }]}
                  numberOfLines={1}
                >
                  {formatMinutes(friendCheckInMinutes)}
                </Text>
                <Text style={styles.poolMeta}>
                  Tap to change · presets 15 min – 6 hr
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
            </AnimatedButton>

            {/* Status */}
            {friendCheckInEnabled ? (
              <Text style={styles.statusLine}>
                {lastNotifAt
                  ? `Last response: ${timeAgo(lastNotifAt)} · next in ~${formatMinutes(friendCheckInMinutes)}`
                  : `Active · next notification in ~${formatMinutes(friendCheckInMinutes)}`}
              </Text>
            ) : null}

            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={11} color={Colors.cyan} />
              <Text style={styles.privacyText}>
                Local notification only — no network. Tap any emoji in the
                notification shade to update without opening the app.
              </Text>
            </View>
          </View>
        </View>

        {/* ─── SLEEP / WAKE — auto-switch wallpaper morning vs night ─── */}
        <View style={styles.modeWrap}>
          <View
            style={[
              styles.modeCard,
              sleepWakeEnabled && {
                borderColor: activeSleepWakePack?.accentColor ?? Colors.gold,
                shadowColor: activeSleepWakePack?.accentColor ?? Colors.gold,
              },
            ]}
          >
            <View style={styles.modeHead}>
              <View style={styles.modeHeadLeft}>
                <View
                  style={[
                    styles.modeIcon,
                    {
                      backgroundColor: sleepWakeEnabled
                        ? activeSleepWakePack?.accentColor ?? Colors.gold
                        : Colors.surfaceHi,
                    },
                  ]}
                >
                  <Ionicons
                    name="sunny"
                    size={18}
                    color={sleepWakeEnabled ? '#131313' : Colors.textDim}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.modeTitleRow}>
                    <Text style={[styles.modeTitle, { color: theme.text }]}>
                      Sleep / Wake mode
                    </Text>
                    {!hasMood ? <PremiumLock /> : null}
                  </View>
                  <Text style={styles.modeBody}>
                    Two wallpapers — one for morning, one for night. Tap the
                    notification at wake/sleep time to apply.
                  </Text>
                </View>
              </View>

              <AnimatedButton
                onPress={onToggleSleepWake}
                style={[
                  styles.toggleBtn,
                  sleepWakeEnabled
                    ? { backgroundColor: activeSleepWakePack?.accentColor ?? Colors.gold }
                    : { backgroundColor: Colors.surfaceHi },
                ]}
              >
                <View
                  style={[
                    styles.toggleKnob,
                    sleepWakeEnabled && styles.toggleKnobOn,
                  ]}
                />
              </AnimatedButton>
            </View>

            {/* Pack picker row */}
            <AnimatedButton onPress={onPickSleepWakePack} style={styles.poolRow}>
              {isCustomSleepWake && sleepWakeCustomWakeId && sleepWakeCustomSleepId ? (
                <>
                  <View style={swStyles.dualThumb}>
                    <Image
                      source={{
                        uri: resolveCustomImage(sleepWakeCustomWakeId) ?? '',
                      }}
                      style={swStyles.dualThumbHalf}
                      contentFit="cover"
                      transition={80}
                    />
                    <Image
                      source={{
                        uri: resolveCustomImage(sleepWakeCustomSleepId) ?? '',
                      }}
                      style={swStyles.dualThumbHalf}
                      contentFit="cover"
                      transition={80}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poolLabel}>Pack</Text>
                    <Text
                      style={[styles.poolName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      Your custom pair
                    </Text>
                    <Text style={styles.poolMeta}>
                      Tap to change
                    </Text>
                  </View>
                </>
              ) : activeSleepWakePack ? (
                <>
                  <View style={swStyles.dualThumb}>
                    <Image
                      source={{ uri: activeSleepWakePack.wakeImage }}
                      style={swStyles.dualThumbHalf}
                      contentFit="cover"
                      transition={80}
                    />
                    <Image
                      source={{ uri: activeSleepWakePack.sleepImage }}
                      style={swStyles.dualThumbHalf}
                      contentFit="cover"
                      transition={80}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poolLabel}>Pack</Text>
                    <Text
                      style={[styles.poolName, { color: theme.text }]}
                      numberOfLines={1}
                    >
                      {activeSleepWakePack.name}
                    </Text>
                    <Text style={styles.poolMeta}>
                      {activeSleepWakePack.tagline}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <View
                    style={[
                      styles.poolThumb,
                      {
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: Colors.border,
                      },
                    ]}
                  >
                    <Ionicons name="moon-outline" size={22} color={Colors.textDim} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.poolLabel}>Pack</Text>
                    <Text style={[styles.poolName, { color: theme.text }]}>
                      Pick a Sleep/Wake pack
                    </Text>
                    <Text style={styles.poolMeta}>6 curated pairs</Text>
                  </View>
                </>
              )}
              <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
            </AnimatedButton>

            {/* Two time pickers side-by-side */}
            <View style={swStyles.timeRow}>
              <AnimatedButton onPress={onPickWakeHour} style={swStyles.timeCell}>
                <Ionicons name="sunny" size={14} color={Colors.gold} />
                <Text style={swStyles.timeLabel}>Wake</Text>
                <Text style={[swStyles.timeValue, { color: theme.text }]}>
                  {formatHour(sleepWakeWakeHour)}
                </Text>
              </AnimatedButton>
              <AnimatedButton onPress={onPickSleepHour} style={swStyles.timeCell}>
                <Ionicons name="moon" size={14} color={Colors.lavender} />
                <Text style={swStyles.timeLabel}>Sleep</Text>
                <Text style={[swStyles.timeValue, { color: theme.text }]}>
                  {formatHour(sleepWakeSleepHour)}
                </Text>
              </AnimatedButton>
            </View>

            <View style={styles.privacyRow}>
              <Ionicons name="information-circle-outline" size={11} color={Colors.textDim} />
              <Text style={styles.privacyText}>
                Tap the notification to apply instantly. If you miss it, the
                background task swaps it within ~30 min.
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Manual override ──────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Manual override
          </Text>
          <Text style={styles.sectionHint}>
            {activeCollection ? 'Apply now' : 'Tap to browse'}
          </Text>
        </View>
        <View style={styles.emojiRow}>
          {MANUAL_MOOD_IDS.map((id) => {
            const m = MOOD_BY_ID[id];
            return (
              <MoodEmojiButton
                key={id}
                mood={m}
                size={btnSize}
                selected={activeMood.id === id}
                onPress={() => onSelectMood(id)}
              />
            );
          })}
        </View>

        {/* ─── Browse moods ─────────────────────────────────────────────── */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Browse mood packs
          </Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.browseRow}
        >
          {(Object.keys(MOOD_BY_ID) as MoodId[]).map((mid) => {
            const m = MOOD_BY_ID[mid];
            return (
              <AnimatedButton
                key={mid}
                onPress={() => router.push(`/mood/${mid}` as Href)}
                style={styles.browseCard}
              >
                <LinearGradient
                  colors={m.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.browseShade} />
                <View style={styles.browseBody}>
                  <Text style={styles.browseEmoji}>{m.emoji}</Text>
                  <Text style={styles.browseLabel}>{m.label}</Text>
                  <Text style={styles.browseTag}>{m.tagline}</Text>
                </View>
              </AnimatedButton>
            );
          })}
        </ScrollView>

        {/* ─── Switch album strip (changes/054) ─────────────────────────
            Always-visible horizontal row of every available pool. Each
            card sets that pool as the mood collection in one tap. The
            final card is "Custom" — opens a chooser for Gallery / URL /
            full-album-editor. Replaces the long-press picker from 053
            which wasn't discoverable. */}
        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Choose album
          </Text>
          <Text style={styles.sectionHint}>Tap any to switch</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={pickerStripStyles.row}
        >
          {albumRows.map((row) => {
            const key =
              row.kind === 'collection' ? row.id : `pack:${row.seedPackId}`;
            const selected =
              row.kind === 'collection'
                ? row.id === moodCollectionId
                : row.existingId != null && row.existingId === moodCollectionId;
            return (
              <AnimatedButton
                key={key}
                onPress={() => onPickAlbum(row)}
                style={[
                  pickerStripStyles.card,
                  selected && {
                    borderColor: theme.primary,
                    shadowColor: theme.primary,
                  },
                ]}
              >
                <Image
                  source={{ uri: row.thumb }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={60}
                  cachePolicy="memory-disk"
                />
                <View style={pickerStripStyles.shade} />
                {selected ? (
                  <View
                    style={[
                      pickerStripStyles.selectedBadge,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Ionicons name="checkmark" size={12} color="#131313" />
                  </View>
                ) : null}
                <View style={pickerStripStyles.cardFoot}>
                  <Text
                    style={pickerStripStyles.cardName}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  <Text style={pickerStripStyles.cardMeta}>
                    {row.count} photos
                  </Text>
                </View>
              </AnimatedButton>
            );
          })}
          {/* Custom — gallery / URL / full editor. */}
          <AnimatedButton
            onPress={onPickCustom}
            style={[
              pickerStripStyles.card,
              pickerStripStyles.customCard,
              { borderColor: theme.secondary },
            ]}
          >
            <View style={pickerStripStyles.customInner}>
              <Ionicons
                name="add-circle-outline"
                size={28}
                color={theme.secondary}
              />
              <Text
                style={[
                  pickerStripStyles.customLabel,
                  { color: theme.secondary },
                ]}
              >
                Custom
              </Text>
              <Text style={pickerStripStyles.customMeta}>
                Gallery · URL
              </Text>
            </View>
          </AnimatedButton>
        </ScrollView>
      </ScrollView>

      {/* Custom-minutes bottom-sheet for the Friend Check-in interval. */}
      <PremiumSheet
        ref={customIntervalSheetRef}
        snapPoints={['52%']}
        title="Custom interval"
        subtitle="How often should I ask? (1 – 1440 min)"
        accentColor={Colors.cyan}
      >
        <View style={customSheetStyles.body}>
          <View style={customSheetStyles.inputRow}>
            <TextInput
              value={customMinInput}
              onChangeText={setCustomMinInput}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="60"
              placeholderTextColor={Colors.textMute}
              style={[customSheetStyles.input, { color: theme.text }]}
              returnKeyType="done"
              onSubmitEditing={saveCustomInterval}
            />
            <Text style={customSheetStyles.unit}>min</Text>
          </View>

          <View style={customSheetStyles.quickRow}>
            {[1, 5, 15, 30, 60, 120, 240, 1440].map((m) => (
              <AnimatedButton
                key={m}
                onPress={() => setCustomMinInput(String(m))}
                style={[
                  customSheetStyles.chip,
                  String(m) === customMinInput && {
                    backgroundColor: Colors.cyan + '22',
                    borderColor: Colors.cyan,
                  },
                ]}
              >
                <Text
                  style={[
                    customSheetStyles.chipText,
                    String(m) === customMinInput && { color: Colors.cyan },
                  ]}
                >
                  {formatMinutes(m)}
                </Text>
              </AnimatedButton>
            ))}
          </View>

          <Text style={customSheetStyles.note}>
            Android rounds repeating values below {FRIEND_CHECK_IN_ANDROID_FLOOR} min up to {FRIEND_CHECK_IN_ANDROID_FLOOR} min (WorkManager floor). iOS supports the exact value.
          </Text>

          <AnimatedButton
            onPress={saveCustomInterval}
            style={[customSheetStyles.saveBtn, { backgroundColor: Colors.cyan }]}
          >
            <Text style={customSheetStyles.saveBtnText}>Save</Text>
          </AnimatedButton>
        </View>
      </PremiumSheet>

      {/* Sleep/Wake pack picker. */}
      <PremiumSheet
        ref={swPackPickerRef}
        snapPoints={['82%']}
        title="Sleep / Wake packs"
        subtitle="Pick a curated pair, or pick your own 2 images."
        accentColor={Colors.gold}
      >
        <View style={{ gap: Spacing.sm }}>
          {/* CUSTOM PAIR — first option so the user immediately sees they
              can pick their own. */}
          <AnimatedButton
            onPress={onPickCustomPair}
            style={[
              swStyles.packRow,
              {
                borderColor: isCustomSleepWake ? Colors.cyan : Colors.cyan + '55',
                borderStyle: 'dashed',
              },
            ]}
          >
            <View
              style={[
                swStyles.packPair,
                { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bgAlt },
              ]}
            >
              <Ionicons name="add-circle" size={26} color={Colors.cyan} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[swStyles.packName, { color: theme.text }]} numberOfLines={1}>
                Custom pair
              </Text>
              <Text style={[swStyles.packTag, { color: Colors.cyan }]} numberOfLines={1}>
                {isCustomSleepWake && sleepWakeCustomWakeId && sleepWakeCustomSleepId
                  ? '✓ Custom wake + sleep picked'
                  : 'Pick any 2 photos — one for ☀️, one for 🌙'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.cyan} />
          </AnimatedButton>

          {SLEEP_WAKE_PACKS.map((pack) => {
            const selected = pack.id === sleepWakePackId;
            return (
              <AnimatedButton
                key={pack.id}
                onPress={async () => {
                  await setSleepWakePackId(pack.id);
                  swPackPickerRef.current?.dismiss();
                  toast(`✓ Pack: ${pack.name}`);
                }}
                style={[
                  swStyles.packRow,
                  { borderColor: selected ? pack.accentColor : Colors.border },
                ]}
              >
                <View style={swStyles.packPair}>
                  <Image
                    source={{ uri: pack.wakeImage }}
                    style={swStyles.packPairHalf}
                    contentFit="cover"
                    transition={80}
                  />
                  <Image
                    source={{ uri: pack.sleepImage }}
                    style={swStyles.packPairHalf}
                    contentFit="cover"
                    transition={80}
                  />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[swStyles.packName, { color: theme.text }]} numberOfLines={1}>
                    {pack.name}
                  </Text>
                  <Text style={[swStyles.packTag, { color: pack.accentColor }]} numberOfLines={1}>
                    {pack.tagline}
                  </Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={pack.accentColor} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.textDim} />
                )}
              </AnimatedButton>
            );
          })}
        </View>
      </PremiumSheet>

      {/* Custom-pair picker — two slots at top + photo grid below. */}
      <PremiumSheet
        ref={swCustomPickerRef}
        snapPoints={['88%']}
        title="Pick your 2 images"
        subtitle="Tap a photo to fill ☀️ Wake. Tap another for 🌙 Sleep. Tap again to clear."
        accentColor={Colors.cyan}
      >
        <View style={{ gap: Spacing.md }}>
          {/* Two slots */}
          <View style={swStyles.slotRow}>
            <CustomSlot
              label="☀️ Wake"
              photoId={sleepWakeCustomWakeId}
            />
            <CustomSlot
              label="🌙 Sleep"
              photoId={sleepWakeCustomSleepId}
            />
          </View>

          {/* Gallery button — opens the system picker so user can pick
              ANY photo from their own phone instead of our curated set. */}
          <SimpleButton
            onPress={onPickFromGallery}
            style={[swStyles.galleryBtn, { borderColor: Colors.cyan }]}
          >
            <Ionicons name="images" size={18} color={Colors.cyan} />
            <Text style={[swStyles.galleryBtnText, { color: Colors.cyan }]}>
              Pick from your phone gallery
            </Text>
          </SimpleButton>

          <Text style={swStyles.divider}>or pick from below</Text>

          {/* Photo grid — SimpleButton (plain Pressable, no Reanimated
              wrapper) so taps register inside the bottom-sheet's
              ScrollView. AnimatedButton wraps Pressable in
              Animated.createAnimatedComponent, and that combo with
              @gorhom/bottom-sheet's pan gesture handler was eating
              touches in the previous build. */}
          <View style={swStyles.photoGrid}>
            {customPhotoPool.map((p) => {
              const selectedWake = sleepWakeCustomWakeId === p.id;
              const selectedSleep = sleepWakeCustomSleepId === p.id;
              const selected = selectedWake || selectedSleep;
              return (
                <SimpleButton
                  key={p.id}
                  onPress={() => onTapCustomPhoto(p.id)}
                  style={[
                    swStyles.photoCell,
                    { width: customCellWidth, height: customCellWidth * (4 / 3) },
                    selected && {
                      borderColor: selectedWake ? Colors.gold : Colors.lavender,
                      borderWidth: 3,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: p.image }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    transition={60}
                  />
                  {selected ? (
                    <View
                      style={[
                        swStyles.photoSelectedBadge,
                        { backgroundColor: selectedWake ? Colors.gold : Colors.lavender },
                      ]}
                    >
                      <Text style={swStyles.photoSelectedBadgeText}>
                        {selectedWake ? '☀️' : '🌙'}
                      </Text>
                    </View>
                  ) : null}
                </SimpleButton>
              );
            })}
          </View>

          {/* Save button */}
          <AnimatedButton
            onPress={onSaveCustomPair}
            style={[
              swStyles.saveBtn,
              {
                backgroundColor:
                  sleepWakeCustomWakeId && sleepWakeCustomSleepId
                    ? Colors.cyan
                    : Colors.surfaceHi,
              },
            ]}
          >
            <Text
              style={[
                swStyles.saveBtnText,
                !(sleepWakeCustomWakeId && sleepWakeCustomSleepId) && {
                  color: Colors.textDim,
                },
              ]}
            >
              {sleepWakeCustomWakeId && sleepWakeCustomSleepId
                ? '✓ Save custom pair'
                : 'Pick both Wake and Sleep to save'}
            </Text>
          </AnimatedButton>
        </View>
      </PremiumSheet>

      {/* URL-input sheet for the Custom → From Internet flow.
          Multi-line: user can paste many URLs (one per line OR comma-
          separated) and they're all downloaded in parallel. */}
      <PremiumSheet
        ref={urlSheetRef}
        snapPoints={['62%']}
        title="Add from internet"
        subtitle="Paste one URL per line (or comma-separated). Up to 10."
        accentColor={Colors.lavender}
      >
        <View style={customSheetStyles.body}>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            placeholder={'https://example.com/baby1.jpg\nhttps://example.com/baby2.jpg'}
            placeholderTextColor={Colors.textMute}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={[
              customSheetStyles.input,
              {
                color: theme.text,
                minHeight: 120,
                paddingTop: Spacing.sm,
                paddingHorizontal: Spacing.md,
                borderWidth: 1.5,
                borderColor: Colors.border,
                borderRadius: Radius.md,
                backgroundColor: Colors.surface,
                fontSize: 14,
              },
            ]}
          />
          <Text style={customSheetStyles.note}>
            Images live inside this app's cache — they do NOT touch
            your phone gallery. {customPoolRemaining > 0
              ? `${customPoolRemaining} slot${customPoolRemaining === 1 ? '' : 's'} free in your custom pool.`
              : 'Pool is full — new picks will replace the oldest.'}
          </Text>
          <AnimatedButton
            onPress={onSaveUrlPhoto}
            style={[
              customSheetStyles.saveBtn,
              { backgroundColor: Colors.lavender },
            ]}
          >
            <Text style={customSheetStyles.saveBtnText}>Download &amp; use</Text>
          </AnimatedButton>
        </View>
      </PremiumSheet>
    </SafeAreaView>
  );
}
