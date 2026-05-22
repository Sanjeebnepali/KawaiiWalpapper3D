import { create } from 'zustand';
import type { CoupleRole } from '../constants/couplePacks';

/**
 * Couple proximity feature — in-memory state. Source of truth for the
 * UI; Supabase is the source of truth for persistence (the couples,
 * couple_locations, couple_settings tables). The store is hydrated on
 * app start by `lib/coupleBootstrap.ts` which fetches the user's
 * active couple from Supabase and subscribes to realtime updates.
 *
 * Lifecycle:
 *   1. App boot → `bootstrapCoupleFeature()` reads the user's row.
 *   2. Setup screen → `createCode()` / `acceptCode()` (in `lib/couple.ts`)
 *      writes to Supabase, then calls `setLink()` on this store.
 *   3. Dashboard → reads `partnerDistanceM`, `connection`, `paused`.
 *   4. Unlink → `setLink(null)` clears everything.
 */

export type LinkStatus =
  | 'unknown'       // not hydrated yet
  | 'unlinked'      // no active couple
  | 'pending'       // created a code, waiting for partner to enter it
  | 'linked';       // both sides bound

export type PartnerProfile = {
  id: string;
  display_name: string | null;
  avatar_id: string | null;
};

export type CoupleLink = {
  code: string;
  status: LinkStatus;
  /** True when the local user CREATED the couple (Person A); false when
   *  they accepted a code (Person B). Used by the dashboard to label
   *  "your code" vs "partner's code". */
  isCreator: boolean;
  /** The slot the local user holds in the active couple pack. Set at
   *  generate time (creator) or accept time (partner) and constant for
   *  the life of the couple — switching packs swaps the labels but
   *  never re-assigns this. Null only while pending and the creator
   *  hasn't yet pushed their role choice (shouldn't happen — UI
   *  enforces a role before Generate). */
  myRole: CoupleRole | null;
  /** The other slot, mirrored from the server. Null until linked. */
  partnerRole: CoupleRole | null;
  /** Null while pending (no partner yet). */
  partner: PartnerProfile | null;
  linked_at: string | null;
};

export type ProximityState =
  | 'unknown'   // no location data yet
  | 'near'      // < threshold metres — couple wallpaper active
  | 'far';      // ≥ threshold metres — solo wallpaper active

type State = {
  hydrated: boolean;
  link: CoupleLink | null;
  /** Latest GPS for each side. `null` until that side reports in. */
  myLat: number | null;
  myLng: number | null;
  myUpdatedAt: number | null;
  /** Reported GPS accuracy (metres) of our last fix — drives the dynamic
   *  buffer zone. Null until the first fix or when the OS omits it. */
  myAccuracy: number | null;
  partnerLat: number | null;
  partnerLng: number | null;
  partnerUpdatedAt: number | null;
  /** Partner's reported GPS accuracy (metres), mirrored from realtime. */
  partnerAccuracy: number | null;
  /** Computed by `recomputeDistance()` every time either side reports. */
  partnerDistanceM: number | null;
  proximity: ProximityState;
  /** Mirrored from `couple_settings.couple_pack_id`. Either partner can
   *  write it via `lib/couple.ts:setCouplePack`. The pack defines
   *  three images (together / role-a-solo / role-b-solo) plus role
   *  labels — see `constants/couplePacks.ts`. */
  couplePackId: string | null;
  /** Mirrored from `couple_settings.paused`. When true, the location
   *  task stops updating Supabase and the wallpaper is locked to solo. */
  paused: boolean;
  /** Mirrored from `couple_settings.proximity_threshold_m`. Default 100. */
  thresholdM: number;
  /** Last error from a couple action (linking, location, wallpaper).
   *  Cleared by `clearError`. */
  error: string | null;
};

type Actions = {
  setHydrated: (v: boolean) => void;
  setLink: (link: CoupleLink | null) => void;
  setMyLocation: (lat: number, lng: number, accuracy?: number | null) => void;
  setPartnerLocation: (
    lat: number,
    lng: number,
    updatedAt: number,
    accuracy?: number | null,
  ) => void;
  setCoupleSettings: (s: {
    couplePackId?: string | null;
    paused?: boolean;
    thresholdM?: number;
  }) => void;
  setError: (msg: string | null) => void;
  clearError: () => void;
  reset: () => void;
};

const INITIAL: State = {
  hydrated: false,
  link: null,
  myLat: null,
  myLng: null,
  myUpdatedAt: null,
  myAccuracy: null,
  partnerLat: null,
  partnerLng: null,
  partnerUpdatedAt: null,
  partnerAccuracy: null,
  partnerDistanceM: null,
  proximity: 'unknown',
  couplePackId: null,
  paused: false,
  thresholdM: 100,
  error: null,
};

export const useCoupleStore = create<State & Actions>((set, get) => ({
  ...INITIAL,

  setHydrated: (v) => set({ hydrated: v }),

  setLink: (link) => {
    set({ link });
    // Clear partner-side state when the link breaks so a stale pin
    // doesn't follow into the next pairing.
    if (link == null || link.status !== 'linked') {
      set({
        partnerLat: null,
        partnerLng: null,
        partnerUpdatedAt: null,
        partnerAccuracy: null,
        partnerDistanceM: null,
        proximity: 'unknown',
      });
    }
  },

  setMyLocation: (lat, lng, accuracy = null) => {
    set({ myLat: lat, myLng: lng, myUpdatedAt: Date.now(), myAccuracy: accuracy });
    recomputeDistance(get(), set);
  },

  setPartnerLocation: (lat, lng, updatedAt, accuracy = null) => {
    set({
      partnerLat: lat,
      partnerLng: lng,
      partnerUpdatedAt: updatedAt,
      partnerAccuracy: accuracy,
    });
    recomputeDistance(get(), set);
  },

  setCoupleSettings: (s) => {
    set((prev) => ({
      couplePackId:
        s.couplePackId !== undefined ? s.couplePackId : prev.couplePackId,
      paused: s.paused !== undefined ? s.paused : prev.paused,
      thresholdM: s.thresholdM !== undefined ? s.thresholdM : prev.thresholdM,
    }));
    // Re-evaluate proximity against the new threshold.
    recomputeDistance(get(), set);
  },

  setError: (msg) => set({ error: msg }),
  clearError: () => set({ error: null }),

  reset: () => set({ ...INITIAL, hydrated: true }),
}));

/**
 * Re-compute distance + proximity from whatever lat/lngs are in state.
 * Called by every location-update path so callers never have to remember.
 * Cheap (constant time) — runs O(1) trig per location push.
 */
function recomputeDistance(
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

// ─── Selectors ───────────────────────────────────────────────────────────
// Narrow selectors so subscribers re-render only when the slice they care
// about changes (Zustand re-runs every subscriber per setState unless
// selectors return shallowly-equal values).

export const useCoupleLink = () => useCoupleStore((s) => s.link);
export const useCoupleProximity = () => useCoupleStore((s) => s.proximity);
export const useCoupleDistance = () => useCoupleStore((s) => s.partnerDistanceM);
export const useCouplePaused = () => useCoupleStore((s) => s.paused);
export const useCouplePackId = () =>
  useCoupleStore((s) => s.couplePackId);
export const useMyRole = () => useCoupleStore((s) => s.link?.myRole ?? null);
