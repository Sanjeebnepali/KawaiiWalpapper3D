/**
 * Proximity geometry for the couple store: distance computation, the dynamic
 * buffer zone, and the great-circle helper. Extracted from `store/couple.ts`
 * so the store file holds the state machine and this file holds the math.
 */
import type { ProximityState, State } from './couple.types';

/**
 * Re-compute distance + proximity from whatever lat/lngs are in state.
 * Called by every location-update path so callers never have to remember.
 * Cheap (constant time) — runs O(1) trig per location push.
 */
export function recomputeDistance(
  s: State,
  set: (patch: Partial<State>) => void,
): void {
  const {
    myLat,
    myLng,
    partnerLat,
    partnerLng,
    myAccuracy,
    partnerAccuracy,
    proximity,
    paused,
  } = s;
  if (
    myLat == null ||
    myLng == null ||
    partnerLat == null ||
    partnerLng == null
  ) {
    set({ partnerDistanceM: null, proximity: 'unknown' });
    return;
  }
  const d = haversineMeters(myLat, myLng, partnerLat, partnerLng);

  // Paused → never report "near" so the wallpaper stays solo.
  if (paused) {
    set({ partnerDistanceM: d, proximity: 'far' });
    return;
  }

  // Dynamic buffer zone WITH HYSTERESIS. The band scales with the WORSE of
  // the two phones' GPS accuracies (be conservative when either side is
  // uncertain). We only flip when the distance leaves the band; INSIDE the
  // band we hold the current state so GPS jitter around the boundary can't
  // make the wallpaper flicker.
  const accs = [myAccuracy, partnerAccuracy].filter(
    (a): a is number => a != null && Number.isFinite(a),
  );
  // Honour the couple's configured threshold: getBufferZone scales its
  // accuracy-derived band by thresholdM/100 (100 m = the design baseline,
  // so the default leaves the band exactly as before). A future "set your
  // threshold" UI now actually moves the near/far edges.
  const { near, far } = getBufferZone(
    accs.length ? Math.max(...accs) : null,
    s.thresholdM,
  );
  let next: ProximityState;
  if (d < near) next = 'near';
  else if (d > far) next = 'far';
  // In the buffer band: keep the current wallpaper. On the very first
  // reading (no prior state) default to 'far' / solo — don't show the
  // couple wallpaper until partners are clearly close.
  else next = proximity === 'unknown' ? 'far' : proximity;

  set({ partnerDistanceM: d, proximity: next });
}

/**
 * Dynamic proximity buffer zone — the near/far thresholds (metres) scale
 * with GPS accuracy so the feature stays accurate from open sky to dense
 * city to mountains. Used with hysteresis in `recomputeDistance`:
 *
 *   distance < near          → 'near'  (couple wallpaper)
 *   distance > far           → 'far'   (solo wallpaper)
 *   near ≤ distance ≤ far     → HOLD the current wallpaper (no flicker)
 *
 *   accuracy < 10 m  → near 80,  far 120   (good GPS fix)
 *   accuracy < 30 m  → near 100, far 150   (typical urban)
 *   accuracy ≥ 30 m  → near 150, far 200   (dense city / indoors / rural)
 *   accuracy unknown → widest band (least flicker)
 *
 * Exported so the location task can size the geofence radius to the FAR
 * edge of the same band.
 *
 * `thresholdM` (optional, default 100 = the design baseline) scales the
 * whole band proportionally — `thresholdM/100` — so the couple's configured
 * `couple_settings.proximity_threshold_m` is honoured instead of being dead
 * state. We clamp the multiplier to a sane 0.2–5× range so a corrupt /
 * extreme stored value can't collapse the band to ~0 m or blow it up to
 * kilometres. Passing the default (or omitting it) reproduces the prior
 * fixed band exactly, keeping existing callers backward-compatible.
 */
export function getBufferZone(
  accuracy: number | null,
  thresholdM: number = 100,
): {
  near: number;
  far: number;
} {
  // base accuracy-derived band (the v1 fixed values).
  let near: number;
  let far: number;
  if (accuracy == null) {
    near = 150;
    far = 200;
  } else if (accuracy < 10) {
    near = 80;
    far = 120;
  } else if (accuracy < 30) {
    near = 100;
    far = 150;
  } else {
    near = 150;
    far = 200;
  }
  const t = Number.isFinite(thresholdM) ? thresholdM : 100;
  const scale = Math.min(5, Math.max(0.2, t / 100));
  return { near: near * scale, far: far * scale };
}

/**
 * Great-circle distance between two lat/lng points in METRES.
 * Earth radius ≈ 6 371 000 m. Accurate enough for the 100 m proximity
 * threshold; we don't need ellipsoidal Vincenty here.
 *
 * Exported so `lib/couple.ts` and any unit test can re-use the exact
 * same formula the store uses internally.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
