import { create } from 'zustand';
import type { Actions, State } from './couple.types';
import { recomputeDistance } from './couple.geo';

/**
 * Couple proximity feature — in-memory state. Source of truth for the
 * UI; Supabase is the source of truth for persistence (the couples,
 * couple_locations, couple_settings tables). The store is hydrated on
 * app start by `lib/coupleBootstrap.ts` which fetches the user's
 * active couple from Supabase and subscribes to realtime updates.
 *
 * Types live in `couple.types.ts`; the proximity geometry
 * (`recomputeDistance`/`getBufferZone`/`haversineMeters`) in `couple.geo.ts`.
 *
 * Lifecycle:
 *   1. App boot → `bootstrapCoupleFeature()` reads the user's row.
 *   2. Setup screen → `createCode()` / `acceptCode()` (in `lib/couple.ts`)
 *      writes to Supabase, then calls `setLink()` on this store.
 *   3. Dashboard → reads `partnerDistanceM`, `connection`, `paused`.
 *   4. Unlink → `setLink(null)` clears everything.
 */

// Re-export the public types + geometry helpers so existing importers of
// `store/couple` keep working unchanged.
export type {
  CoupleLink,
  LinkStatus,
  PartnerProfile,
  ProximityState,
} from './couple.types';
export { getBufferZone, haversineMeters } from './couple.geo';

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
