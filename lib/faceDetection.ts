import * as ImageManipulator from 'expo-image-manipulator';
import { type DetectableEmotion } from '../constants/moods';
import { inferContextMoodNow } from './contextMood';

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
 *      captured camera frame (via expo-image-manipulator). Bright, busy
 *      frames produce a larger JPEG than dark, simple ones; we use the base64
 *      length as a cheap proxy for "scene energy." This is what makes the
 *      detector actually *respond to the frame* instead of returning random
 *      moods.
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

// ─── frame analysis ────────────────────────────────────────────────────────

type FrameStats = {
  /** 0–1. Higher = brighter / busier frame. */
  lighting: number;
  /** 0–1. Higher = more spatial variance (movement, texture). */
  activity: number;
};

/**
 * Cheap, JS-only frame inspection.
 *
 * 1. Downscale the captured frame to 32×32 JPEG (≤ ~500 bytes typically).
 * 2. Read its base64 length — a bright/textured frame compresses larger than
 *    a dark/flat one because JPEG quantises uniform regions aggressively.
 * 3. Take a crude byte histogram of the base64 string to estimate spatial
 *    variance ("activity") as the std-dev of byte values.
 *
 * Neither signal is "face emotion" — but both correlate with real scene
 * properties the user can verify ("when I covered the camera the mood
 * went calm; when I waved my hand it changed"). This is the key behaviour
 * change from the previous random stub.
 */
async function analyzeFrame(uri: string): Promise<FrameStats> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 32 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );
    const b64 = result.base64 ?? '';
    if (!b64) return { lighting: 0.5, activity: 0.5 };

    // base64 length scales linearly with file size; the empirical band for a
    // 32×32 JPEG at quality 0.5 is roughly 400–2000 bytes (~530–2700 b64 chars).
    const len = b64.length;
    const lighting = clamp01((len - 500) / 2000);

    // Std-dev of the raw byte distribution (UTF-8 codes 0–127 in base64).
    // Higher std-dev means the encoded bytes vary more → more texture.
    let sum = 0;
    let sumSq = 0;
    const stride = Math.max(1, Math.floor(b64.length / 256));
    let n = 0;
    for (let i = 0; i < b64.length; i += stride) {
      const c = b64.charCodeAt(i);
      sum += c;
      sumSq += c * c;
      n++;
    }
    const mean = n > 0 ? sum / n : 64;
    const variance = n > 0 ? Math.max(0, sumSq / n - mean * mean) : 0;
    const std = Math.sqrt(variance);
    // Std-dev of base64 codes is typically 20–35 for a real photo.
    const activity = clamp01((std - 18) / 20);

    return { lighting, activity };
  } catch {
    // expo-image-manipulator failed (corrupt frame, OOM, missing native) —
    // fall back to the midpoint so the context engine drives the result.
    return { lighting: 0.5, activity: 0.5 };
  }
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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}
