/**
 * Types for the couple-proximity store (`store/couple.ts`). Extracted so the
 * store file holds behaviour and this file holds shape.
 */
import type { CoupleRole } from '../constants/couplePacks';

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

export type State = {
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

export type Actions = {
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
