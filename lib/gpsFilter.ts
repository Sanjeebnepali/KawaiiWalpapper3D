/**
 * GPS smoothing via a 1-D Kalman filter — the standard "clean up a noisy GPS
 * track" algorithm.
 *
 * WHY: consumer-phone GPS drifts several metres between fixes even when the
 * phone is perfectly still. The couple distance is computed from TWO such noisy
 * positions, so the errors stack and the number bounces (e.g. 30 → 20 → 18 m at
 * one spot, with nobody moving). Faster polling can't fix this — the noise is
 * in each measurement, not the cadence. Running every fix through this filter
 * before it's used damps the bouncing: the estimate converges while stationary
 * and still tracks real movement, because each measurement is weighted by its
 * own reported accuracy (a vague fix barely moves the estimate; a sharp one
 * moves it a lot).
 *
 * It does NOT make GPS magically precise — two devices still carry inherent
 * error (worse indoors / beside tall buildings). It removes the noise-driven
 * jitter so the distance is STABLE and follows the real trend.
 *
 * Math: between fixes the position variance grows by Q²·Δt (Q ≈ expected
 * movement speed in m/s); each measurement corrects it by the Kalman gain
 * k = var / (var + accuracy²). Lat and lng share one scalar variance — fine at
 * the metre scale this feature works at.
 */
export class GpsKalmanFilter {
  private timestampMs = 0;
  private lat = 0;
  private lng = 0;
  /** Position-estimate variance in metres². < 0 means "not yet initialised". */
  private variance = -1;

  /** @param qMetresPerSecond expected movement speed; higher = less smoothing. */
  constructor(private readonly qMetresPerSecond: number) {}

  /** Feed one raw fix; returns the smoothed position + its 1σ accuracy (m). */
  process(
    lat: number,
    lng: number,
    accuracyM: number,
    timestampMs: number,
  ): { lat: number; lng: number; accuracy: number } {
    const accuracy = Math.max(accuracyM, 1);
    if (this.variance < 0) {
      // First fix: take it as-is and seed the variance from its accuracy.
      this.timestampMs = timestampMs;
      this.lat = lat;
      this.lng = lng;
      this.variance = accuracy * accuracy;
    } else {
      const dtSec = (timestampMs - this.timestampMs) / 1000;
      if (dtSec > 0) {
        this.variance += dtSec * this.qMetresPerSecond * this.qMetresPerSecond;
        this.timestampMs = timestampMs;
      }
      const k = this.variance / (this.variance + accuracy * accuracy);
      this.lat += k * (lat - this.lat);
      this.lng += k * (lng - this.lng);
      this.variance *= 1 - k;
    }
    return { lat: this.lat, lng: this.lng, accuracy: Math.sqrt(this.variance) };
  }

  /** Forget all state — the next fix is taken as a fresh first reading. */
  reset(): void {
    this.variance = -1;
  }
}

// ─── Outlier gate (runs BEFORE the filter) ─────────────────────────────────
// The Kalman filter weights by accuracy, but two kinds of bad fix still hurt:
//   1. A "teleport" glitch — a fix that reports GOOD accuracy but a position
//      hundreds of metres off; the filter trusts it and yanks the estimate.
//   2. A fix vaguer than ~100 m — worse than just keeping the last good one.
// Dropping both before they reach the filter keeps the distance honest.

const MAX_ACCURACY_M = 100; // drop fixes vaguer than this when we have a recent one
const MAX_SPEED_MPS = 55; // ~200 km/h between fixes ⇒ a teleport glitch, not real motion
const STALE_AFTER_MS = 60_000;

let hasLast = false;
let lastLat = 0;
let lastLng = 0;
let lastMs = 0;

/** Cheap equirectangular metres — accurate enough for the speed sanity check. */
function approxMeters(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6_371_000;
  const dLat = ((la2 - la1) * Math.PI) / 180;
  const dLng = ((lo2 - lo1) * Math.PI) / 180;
  const x = dLng * Math.cos(((la1 + la2) * Math.PI) / 360);
  return R * Math.sqrt(dLat * dLat + x * x);
}

/**
 * Decide whether to accept a raw fix. Records the accepted position so the next
 * call can sanity-check speed. The FIRST fix (or one after a long gap) is always
 * accepted — we need a starting point. Side-effecting on purpose: an accepted
 * fix updates the "last accepted" baseline. (An explicit `hasLast` flag — not a
 * timestamp sentinel — so a legitimate `timeMs` of 0 still counts as a fix.)
 */
export function acceptFix(
  lat: number,
  lng: number,
  accuracyM: number | null,
  timeMs: number,
): boolean {
  const haveRecent = hasLast && timeMs - lastMs < STALE_AFTER_MS;
  if (accuracyM != null && accuracyM > MAX_ACCURACY_M && haveRecent) return false;
  if (haveRecent) {
    const dt = (timeMs - lastMs) / 1000;
    if (dt > 0 && approxMeters(lastLat, lastLng, lat, lng) / dt > MAX_SPEED_MPS) {
      return false;
    }
  }
  hasLast = true;
  lastLat = lat;
  lastLng = lng;
  lastMs = timeMs;
  return true;
}

// Singleton for the LOCAL user's track: every place our GPS enters funnels
// through this one instance (foreground live loop + background stream + seed)
// so the filter sees a single time-ordered stream of our fixes.
const myFilter = new GpsKalmanFilter(2);

export function smoothMyFix(
  lat: number,
  lng: number,
  accuracyM: number | null,
  timestampMs: number,
): { lat: number; lng: number; accuracy: number } {
  // Unknown accuracy → treat as poor (50 m) so an unrated fix is down-weighted.
  return myFilter.process(lat, lng, accuracyM ?? 50, timestampMs);
}

export function resetMyFix(): void {
  myFilter.reset();
  hasLast = false;
}
