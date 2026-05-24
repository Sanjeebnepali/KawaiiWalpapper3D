/**
 * Frame inspection for the mood detector — the JS-only image-manipulation
 * concern, extracted from `faceDetection.ts` so that file holds the public
 * detector API + mood mapping and this one holds the pixel-proxy heuristics.
 */
import * as ImageManipulator from 'expo-image-manipulator';

export type FrameStats = {
  /** 0–1. Higher = brighter / busier frame. */
  lighting: number;
  /** 0–1. Higher = more spatial variance (movement, texture). */
  activity: number;
};

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

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
export async function analyzeFrame(uri: string): Promise<FrameStats> {
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
