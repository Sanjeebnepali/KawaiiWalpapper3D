import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  type DetectableEmotion,
  emotionToMood,
  type MoodId,
} from '../constants/moods';
import {
  detectEmotion,
  type FaceDetectionResult,
  loadFaceModels,
} from '../lib/faceDetection';
import { useMoodStore } from '../store/mood';

/**
 * Periodically captures a frame from the supplied `expo-camera` ref, runs the
 * face detector, and pushes the result into the mood store.
 *
 * Default cadence is 60 s (spec). The first scan fires ~3 s after models are
 * loaded so the user sees something happen quickly.
 *
 * Owns:
 *  - model warm-up state (`ready` flag)
 *  - per-scan UI state (`scanning`, `lastResult`, `error`)
 *  - cadence + AppState-aware pause (no scans while backgrounded)
 *
 * Does NOT own:
 *  - camera permission (caller passes `enabled` once granted)
 *  - the CameraView component itself (caller renders it)
 *
 * @param cameraRef React ref produced by `useRef<CameraView>(null)`. We treat
 *   it loosely (`any`) so this file does not transitively require expo-camera
 *   at parse time — the screen that uses it imports both.
 */
export type ScanResult =
  | { status: 'ok' }
  | { status: 'not-ready' }
  | { status: 'failed'; error: string };

export type MoodDetectorState = {
  ready: boolean;
  scanning: boolean;
  error: string | null;
  lastResult: FaceDetectionResult | null;
  /** Resolved mood for the last successful detection. */
  lastMood: MoodId | null;
  /** ms since epoch of next planned scan (for the countdown chip). */
  nextScanAt: number | null;
  /** Force an immediate scan. Returns 'not-ready' when the camera ref
   *  hasn't mounted yet (caller can retry shortly), or 'failed' with the
   *  underlying exception message so the UI can surface what actually
   *  broke instead of a vague "scan failed". */
  scanNow: () => Promise<ScanResult>;
};

const DEFAULT_INTERVAL_MS = 60_000;
const FIRST_SCAN_DELAY_MS = 2_500;

export function useMoodDetector(
  cameraRef: { current: { takePictureAsync?: Function } | null },
  enabled: boolean,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): MoodDetectorState {
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<FaceDetectionResult | null>(null);
  const [lastMood, setLastMood] = useState<MoodId | null>(null);
  const [nextScanAt, setNextScanAt] = useState<number | null>(null);

  const reportCameraMood = useMoodStore((s) => s.reportCameraMood);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Two refs so an in-flight scan resolving during an effect *re-run* (e.g.
  // `enabled` flipping) is NOT mistaken for a real unmount. Audit finding #3.
  const unmountedRef = useRef(false);
  const scanInFlightRef = useRef(false);

  useEffect(
    () => () => {
      unmountedRef.current = true;
    },
    [],
  );

  // 1) Load the face-api.js models exactly once per app run.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadFaceModels();
        if (!cancelled && !unmountedRef.current) setReady(true);
      } catch (e) {
        if (!cancelled && !unmountedRef.current)
          setError(e instanceof Error ? e.message : 'Failed to load models');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scanNow = useCallback(async (): Promise<ScanResult> => {
    if (scanInFlightRef.current) return { status: 'not-ready' };
    if (!cameraRef.current?.takePictureAsync) return { status: 'not-ready' };
    scanInFlightRef.current = true;
    setScanning(true);
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        skipProcessing: true,
        // shutterSound: false — option name varies across expo-camera versions;
        // safest is to omit and accept the OS shutter sound.
        exif: false,
      });
      if (!photo || !photo.uri) {
        throw new Error('Camera returned no frame');
      }
      const result = await detectEmotion({
        uri: photo.uri,
        width: photo.width,
        height: photo.height,
      });
      // Host unmounted while the detector was awaiting — resolve to a valid
      // ScanResult variant (not a bare `undefined`) so callers can always read
      // `r.status` without a TypeError. Audit MOOD-1.
      if (unmountedRef.current) return { status: 'ok' };
      setLastResult(result);
      if (result.faceFound && result.emotion) {
        const mood = emotionToMood(result.emotion as DetectableEmotion);
        setLastMood(mood);
        await reportCameraMood(mood, result.confidence);
      }
      return { status: 'ok' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Detection failed';
      if (!unmountedRef.current) setError(msg);
      return { status: 'failed', error: msg };
    } finally {
      scanInFlightRef.current = false;
      if (!unmountedRef.current) setScanning(false);
    }
  }, [cameraRef, reportCameraMood]);

  // 2) Cadence — only ticks while `enabled` AND the app is foregrounded.
  useEffect(() => {
    if (!enabled || !ready) {
      if (timerRef.current) clearTimeout(timerRef.current);
      setNextScanAt(null);
      return;
    }

    let active = true;
    let appStateActive = AppState.currentState === 'active';
    // Bug D: when the camera ref isn't ready yet (cold start, CameraView
    // still measuring), don't wait the full 60 s for the next try — keep
    // retrying every 2 s until we either succeed or have spent 30 s trying.
    let earlyRetryCount = 0;
    const MAX_EARLY_RETRIES = 15; // 15 × 2 s = 30 s

    const scheduleNext = (delay: number) => {
      if (!active) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setNextScanAt(Date.now() + delay);
      timerRef.current = setTimeout(async () => {
        if (!active || !appStateActive) return;
        const r = await scanNow();
        if (r.status === 'not-ready' && earlyRetryCount < MAX_EARLY_RETRIES) {
          earlyRetryCount++;
          scheduleNext(2_000);
          return;
        }
        earlyRetryCount = 0; // reset once we got past the warmup
        scheduleNext(intervalMs);
      }, delay);
    };

    scheduleNext(FIRST_SCAN_DELAY_MS);

    const sub = AppState.addEventListener('change', (next) => {
      appStateActive = next === 'active';
      if (!appStateActive && timerRef.current) {
        clearTimeout(timerRef.current);
        setNextScanAt(null);
      } else if (appStateActive && active) {
        // On RESUME, use the short first-scan delay (≈ 2.5 s) so the user
        // sees a scan happen within seconds of returning to the app instead
        // of waiting the full 60 s interval. Previously a user who exited
        // the app and came back thought the camera tier had stopped working
        // and only "fixed" it by toggling Mood Mode off and on.
        scheduleNext(FIRST_SCAN_DELAY_MS);
      }
    });

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      sub.remove();
    };
  }, [enabled, ready, intervalMs, scanNow]);

  return {
    ready,
    scanning,
    error,
    lastResult,
    lastMood,
    nextScanAt,
    scanNow,
  };
}
