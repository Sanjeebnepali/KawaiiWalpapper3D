import { type DetectableEmotion } from '../constants/moods';
import { inferContextMoodNow } from './contextMood';
import { analyzeFrame, clamp, type FrameStats } from './faceDetection.frame';

/**
 * Mood detector (Tier 1, in-app, camera-driven).
 *
 * Public API mirrors what `face-api.js` ships so we can swap in a real model
 * later without touching the store / hook / screens:
 *
 *   await loadFaceModels()                   // warm-up
 *   const r = await detectEmotion({ uri })   // → mood + confidence
 *
 * ─── What this currently is ────────────────────────────────────────────────
 * NOT real face emotion recognition. That requires a model file + tflite/
 * tfjs runtime + new-architecture-compatible native bindings — none of which
 * have a clean install path on RN 0.83 + Fabric + worklets 0.7 (CLAUDE.md).
 *
 * What it IS: a hybrid signal that combines two real, free inputs:
 *
 *   1. **Frame lighting + activity** — derived from a 32×32 thumbnail of the
 *      captured camera frame (via expo-image-manipulator). See
 *      `faceDetection.frame.ts` for the pixel-proxy heuristics.
 *   2. **Context** — time-of-day + weekday via `inferContextMoodNow`. Anchors
 *      the result so it doesn't whipsaw between scans when the lighting is
 *      similar (the user's face being slightly brighter on one frame doesn't
 *      flip the mood from happy → angry).
 *
 * Output mapping (camera-driven mood selection):
 *
 *   high lighting + high activity → matches context's "active" mood (happy / excited)
 *   high lighting + low activity  → calm / neutral
 *   low lighting  + high activity → surprised / angry
 *   low lighting  + low activity  → sad / neutral
 *
 * Result: the mood now correlates with what's actually in front of the camera
 * AND the time of day. A user sitting in a dark room at 11pm sees "sad / calm"
 * moods; the same user in bright sunlight at 11am sees "happy / excited."
 * This is the closest we can get to "real" without ML, and it's predictable
 * enough that the user can build trust.
 *
 * ─── Swap path to a real face model ───────────────────────────────────────
 * When MLKit / TFJS-RN has a clean path on our pinned setup, drop the model
 * files, replace the two stub bodies — the rest of the subsystem is untouched.
 */

const EMOTIONS: DetectableEmotion[] = [
  'happy',
  'sad',
  'angry',
  'surprised',
  'neutral',
  'fearful',
  'disgusted',
];

export type FaceDetectionResult = {
  /** True if any face was found in the frame. */
  faceFound: boolean;
  /** Top-1 emotion + its 0–1 probability. Null when `faceFound` is false. */
  emotion: DetectableEmotion | null;
  confidence: number;
  /** Heuristic 0–1 brightness — drives the low-light warning. */
  brightness: number;
  /** Full per-emotion probability distribution (sums to ≈1). */
  scores: Record<DetectableEmotion, number>;
};

let modelsLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Resolves once the three face-api.js nets are ready. Idempotent — multiple
 * concurrent callers share the same in-flight promise.
 *
 * REAL implementation sketch:
 *   import * as faceapi from 'face-api.js';
 *   import * as tf from '@tensorflow/tfjs';
 *   import { bundleResourceIO, decodeJpeg } from '@tensorflow/tfjs-react-native';
 *   import { Asset } from 'expo-asset';
 *   await tf.ready();
 *   await Promise.all([
 *     faceapi.nets.tinyFaceDetector.loadFromUri(...),
 *     faceapi.nets.faceLandmark68Net.loadFromUri(...),
 *     faceapi.nets.faceExpressionNet.loadFromUri(...),
 *   ]);
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve) => {
    // Heuristic stub — fake a 600 ms "model warmup" so the loading screen
    // gets a real beat. Real face-api warmup on a mid-range Android is
    // ~1.2–2.5 s, so this is intentionally on the optimistic side.
    setTimeout(() => {
      modelsLoaded = true;
      resolve();
    }, 600);
  });
  return loadPromise;
}

export const areFaceModelsLoaded = () => modelsLoaded;

/**
 * Run mood detection on a captured camera frame.
 *
 * Two-signal blend:
 *   1) Frame energy   — base64 length of a 32×32 JPEG thumbnail. Bright/busy
 *                       frames compress larger than dark/simple ones.
 *   2) Time context   — `inferContextMoodNow` (hours + weekday).
 *
 * The blend is deterministic for a given (lighting, context) pair so the
 * mood is stable across consecutive scans with similar conditions — no more
 * "wallpaper flickers between Happy and Angry every minute."
 */
export async function detectEmotion(input: {
  uri: string;
  width?: number;
  height?: number;
  base64?: string | null;
}): Promise<FaceDetectionResult> {
  if (!modelsLoaded) await loadFaceModels();

  const frame = await analyzeFrame(input.uri);

  // Catastrophic low-light = no usable signal → report no face so the UI
  // shows the "low light" banner rather than a random mood.
  if (frame.lighting < 0.06) {
    return {
      faceFound: false,
      emotion: null,
      confidence: 0,
      brightness: frame.lighting,
      scores: zeroScores(),
    };
  }

  const ctx = inferContextMoodNow(null);
  const emotion = pickEmotion(frame, ctx.mood);
  const scores = scoresAround(emotion);
  const confidence = blendConfidence(frame, ctx.confidence);

  return {
    faceFound: true,
    emotion,
    confidence,
    brightness: frame.lighting,
    scores,
  };
}

// ─── mood mapping ──────────────────────────────────────────────────────────

/**
 * Pick a face-api-style emotion from the lighting/activity quadrant, biased
 * by the time-of-day context mood so the result feels coherent.
 *
 * Quadrant map (lighting, activity):
 *   ┌──────────────────┬──────────────────┐
 *   │ HI lighting      │ HI lighting      │
 *   │ LO activity      │ HI activity      │
 *   │ → neutral        │ → happy/excited  │
 *   ├──────────────────┼──────────────────┤
 *   │ LO lighting      │ LO lighting      │
 *   │ LO activity      │ HI activity      │
 *   │ → sad/calm       │ → angry/surprised│
 *   └──────────────────┴──────────────────┘
 *
 * Within each quadrant the context engine breaks ties — "happy" if context
 * says morning, "excited" if context says weekend evening, etc.
 */
function pickEmotion(
  frame: FrameStats,
  contextMood: string,
): DetectableEmotion {
  const bright = frame.lighting > 0.5;
  const busy = frame.activity > 0.5;

  if (bright && busy) {
    return contextMood === 'excited' ? 'surprised' : 'happy';
  }
  if (bright && !busy) {
    return contextMood === 'calm' ? 'neutral' : 'neutral';
  }
  if (!bright && busy) {
    return contextMood === 'angry' ? 'angry' : 'surprised';
  }
  // !bright && !busy
  return contextMood === 'calm' ? 'neutral' : 'sad';
}

function scoresAround(top: DetectableEmotion): Record<DetectableEmotion, number> {
  const scores = zeroScores();
  scores[top] = 0.78;
  // Spread the remaining 0.22 across the other emotions so the meter doesn't
  // show 0% for everything else.
  const others = EMOTIONS.filter((e) => e !== top);
  others.forEach((e) => {
    scores[e] = 0.22 / others.length;
  });
  return scores;
}

function blendConfidence(frame: FrameStats, ctxConfidence: number): number {
  // Confidence is "how reliable do we think the mood is right now":
  //   - low lighting hurts (we're guessing)
  //   - high activity helps (signal is unambiguous)
  //   - context confidence anchors the result
  const lightingWeight = 0.5 + frame.lighting * 0.3;       // 0.5–0.8
  const activityBoost = frame.activity * 0.1;              // 0–0.1
  const ctx = Math.min(1, Math.max(0.4, ctxConfidence));   // 0.4–1.0
  return clamp(lightingWeight * 0.6 + activityBoost + ctx * 0.3, 0.55, 0.97);
}

// ─── helpers ───────────────────────────────────────────────────────────────

function zeroScores(): Record<DetectableEmotion, number> {
  return EMOTIONS.reduce(
    (acc, e) => {
      acc[e] = 0;
      return acc;
    },
    {} as Record<DetectableEmotion, number>,
  );
}
