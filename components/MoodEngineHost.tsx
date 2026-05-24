import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
// Type-only import — fully erased at compile time, so expo-camera is still
// loaded lazily via the require() below, never eagerly at parse time.
import type { CameraView as ExpoCameraView } from 'expo-camera';
import { type MoodId } from '../constants/moods';
import { useMoodDetector } from '../hooks/useMoodDetector';
import { applyMoodPhotoFromCollection } from '../lib/moodEngineActions';
import { useMoodStore } from '../store/mood';
import { useSettingsStore } from '../store/settings';

/**
 * Global mood engine — the "auto-shuffle by mood" runtime.
 *
 * Mounted ONCE at the app root (`app/_layout.tsx`) next to ShuffleEngineHost.
 * When all four preconditions hold:
 *
 *   isPremium && moodModeEnabled && moodCollectionId && CameraView available
 *
 * …it mounts a tiny 1×1 invisible front-camera view in the corner of the
 * screen, runs the 60 s face-detection loop, and auto-applies a photo from
 * the active Collection on every detected mood change (via the hash bucket
 * in `lib/moodBucket.ts`).
 *
 * When ANY precondition flips false, the body returns `null` so the camera
 * is fully unmounted — no battery cost, no privacy indicator.
 *
 * Background reality: the OS prevents the camera from being read while the
 * app is backgrounded (Android 10+ / iOS), so the engine pauses via
 * `useMoodDetector`'s AppState-aware cadence. When the user returns to the
 * app, scanning resumes. This is the same limitation the timer-based
 * `ShuffleEngineHost` works around.
 */

let CameraView: typeof ExpoCameraView | null = null;
try {

  CameraView = require('expo-camera').CameraView;
} catch {
  // expo-camera not linked yet — engine simply never activates.
}

export function MoodEngineHost() {
  // Gate at the top. Zero hooks here so the conditional render of a
  // hook-heavy child is safe.
  const isPremium = useSettingsStore((s) => s.isPremium);
  const enabled = useMoodStore((s) => s.moodModeEnabled);
  const collectionId = useMoodStore((s) => s.moodCollectionId);

  if (!CameraView) return null;
  if (!isPremium || !enabled || !collectionId) return null;

  return <ActiveEngine collectionId={collectionId} />;
}

/**
 * Module-level scan trigger. The `ActiveEngine` registers its `scanNow`
 * callback here on mount; UI components (e.g. the "Scan now" button on
 * Mood Home) can call `triggerImmediateMoodScan()` without having to plumb
 * a ref through React context.
 */
import type { ScanResult } from '../hooks/useMoodDetector';

export type ImmediateScanResult = ScanResult | { status: 'no-engine' };

let scanTrigger: (() => Promise<ScanResult>) | null = null;

export async function triggerImmediateMoodScan(): Promise<ImmediateScanResult> {
  if (!scanTrigger) return { status: 'no-engine' };
  return await scanTrigger();
}

function ActiveEngine({ collectionId }: { collectionId: string }) {
  const cameraRef = useRef<ExpoCameraView | null>(null);
  const detector = useMoodDetector(cameraRef, /* enabled */ true);

  // Register the scan trigger so the UI's "Scan now" button can call into
  // the engine without prop-drilling a ref. Unregisters on unmount.
  useEffect(() => {
    scanTrigger = detector.scanNow;
    return () => {
      if (scanTrigger === detector.scanNow) scanTrigger = null;
    };
  }, [detector.scanNow]);

  // Concurrency guard only — we no longer dedupe on "same mood" at all.
  //
  // History note: earlier versions skipped re-apply when the detector
  // returned the same mood as the last apply, then later allowed re-apply
  // after a 5-minute window. Both versions left the user staring at the
  // same wallpaper for minutes despite the camera scanning every 60 s,
  // which read as "broken" — even though the algorithm was correct
  // (stable lighting + steady face = stable mood = same bucket).
  //
  // Current behaviour: every detected mood triggers an apply. The
  // `pickPhotoForMood` call uses `excludeId = currentPhotoId` so a
  // same-mood scan rotates to a different photo from the same bucket
  // (visible change every 60 s); a mood change immediately switches to
  // the new bucket. `applyInFlightRef` prevents two scans from racing.
  const applyInFlightRef = useRef(false);

  useEffect(() => {
    const m = detector.lastMood;
    if (!m) return;
    if (applyInFlightRef.current) return;

    applyInFlightRef.current = true;
    (async () => {
      try {
        const excludeId = useMoodStore.getState().currentPhotoId;
        const r = await applyMoodPhotoFromCollection(m, collectionId, excludeId);
        if (r.ok && r.photoId) {
          await useMoodStore.getState().setCurrentMoodPhoto(r.photoId);
        }
      } catch (e) {
        if (__DEV__) console.warn('[MoodEngineHost] apply failed:', e);
      } finally {
        applyInFlightRef.current = false;
      }
    })();
  }, [detector.lastMood, collectionId]);

  // CameraView is guaranteed non-null here — MoodEngineHost gates on it before
  // mounting ActiveEngine. This guard (placed after all hooks, so hook order is
  // unchanged) re-narrows the union for the type checker.
  if (!CameraView) return null;
  const Camera = CameraView;

  return (
    <View pointerEvents="none" style={styles.hidden}>
      <Camera
        ref={cameraRef}
        facing="front"
        mute
        mode="picture"
        style={styles.camera}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // FIFTH positioning strategy, this one supported by logcat evidence.
  //
  // All previous attempts (1×1 hidden, 96×128 opacity 0.001, off-screen
  // translateX -10000, 240×320 in a 1×1 clip parent) failed for the same
  // root reason on Vivo OriginOS — confirmed via `adb logcat --pid=…`:
  //
  //   D  Camera2CameraImpl: getSurface done with results: [null, Surface, Surface]
  //   D  Camera2CameraImpl: {Camera@…[id=1]} Posting surface closed
  //   D  Camera2CameraImpl: java.lang.Throwable
  //         at Camera2CameraImpl.postSurfaceClosedError(…)
  //
  // The PREVIEW surface (first slot) comes back NULL. PreviewView's
  // SurfaceView only attaches a real Surface to the windowing system when
  // it's laid out at a real, on-screen, non-clipped size. Any hiding trick
  // (opacity 0, off-screen translation, clipping parent) prevents the
  // attach → null Surface → `postSurfaceClosedError` → `takePictureAsync`
  // fails. The user sees the green camera dot (HAL did open) but no frame.
  //
  // The pragmatic fix: render the camera at a real small visible size at
  // (0, 0). RootStack mounts AFTER MoodEngineHost in `_layout.tsx`, and
  // the Stack's screen `contentStyle.backgroundColor = theme.bg` makes
  // each screen a fully opaque full-screen view that covers the camera
  // visually. The 80×100 camera is rendered + measured + has a real
  // window → real Preview Surface → ImageCapture works.
  //
  // Net behaviour: green camera dot appears as before (OS privacy), and
  // the camera preview never visually reaches the user because it's
  // sitting BEHIND the Stack content. takePictureAsync now returns real
  // image bytes that the detector can analyse.
  hidden: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 80,
    height: 100,
    // No opacity / no clipping. zIndex would be a defensive belt-and-
    // braces but isn't strictly needed — sibling order in _layout.tsx
    // already puts RootStack on top.
  },
  camera: { width: 80, height: 100 },
});
