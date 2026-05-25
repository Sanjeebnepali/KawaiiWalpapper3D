/**
 * Couple hydration + Supabase reads.
 *
 * Cold-start / restore reads that pull the user's active couple and shared
 * state out of Supabase into the in-memory shape the store consumes. Kept
 * separate from the mutating actions + realtime in `lib/couple.ts`; that
 * file imports `fetchActiveCouple` from here, so this module must NOT import
 * back from `lib/couple.ts` (no cycle). Re-exported from `lib/couple.ts` so
 * external importers keep working unchanged.
 */

import type { CoupleRole } from '../constants/couplePacks';
import { grantCoupleEntitlement } from './billing';
import { useCoupleStore, type CoupleLink, type PartnerProfile } from '../store/couple';
import { useAuthStore } from '../store/auth';
import { supabase } from './supabase';

// ─── Hydration on app start ──────────────────────────────────────────────

/**
 * Read the user's active couple from Supabase. Returns the in-memory shape
 * the store consumes. Null when there is no non-unlinked couple.
 *
 * Always fetches the partner profile in the same round-trip via the
 * embedded select syntax so we don't show "Linked with …" with a blank
 * name for a frame on cold start.
 */
export async function fetchActiveCouple(): Promise<CoupleLink | null> {
  const uid = useAuthStore.getState().user?.id;
  if (!uid) return null;

  // PRIMARY (changes/105): the `get_my_couple()` SECURITY DEFINER RPC. It
  // returns the caller's active couple — host OR partner — plus the other
  // member's profile and the active pack, in one round-trip that does NOT
  // depend on PostgREST resolving an `.or(creator,partner)` filter against RLS
  // exactly right. The previous direct `select` came back EMPTY on the host
  // side after a reinstall, stranding a reinstalled host on "Pair your couple"
  // unable to rejoin its own couple. The RPC is the reliable restore path.
  const { data, error } = await supabase.rpc('get_my_couple');
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return mapCoupleRow(row, uid);
  }

  // FALLBACK: the RPC isn't deployed yet (couple_reconnect_v3.sql not run).
  // Use the original bare-row select so the app keeps working exactly as
  // before until the migration is applied. NO PostgREST embed (couples FKs
  // point at auth.users, not public.profiles — an embed returns PGRST200).
  if (__DEV__) {
    console.warn('[couple] get_my_couple RPC unavailable, using fallback:', error.message);
  }
  const { data: rows, error: selErr } = await supabase
    .from('couples')
    .select(
      'code, creator_id, partner_id, status, linked_at, creator_role, partner_role',
    )
    .or(`creator_id.eq.${uid},partner_id.eq.${uid}`)
    .neq('status', 'unlinked')
    .limit(1)
    .maybeSingle();

  if (selErr || !rows) return null;

  const isCreator = rows.creator_id === uid;
  const otherId = isCreator ? rows.partner_id : rows.creator_id;
  let other: PartnerProfile | null = null;
  if (otherId) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_id')
      .eq('id', otherId)
      .maybeSingle();
    other = (prof as PartnerProfile | null) ?? null;
  }
  if (rows.status === 'linked') {
    // Creator generated the code → they hold the (paid) entitlement; the
    // accepter inherited it. The source drives the unlink re-lock rule.
    grantCoupleEntitlement(isCreator ? 'purchased' : 'inherited');
  }
  return {
    code: rows.code,
    status: rows.status as CoupleLink['status'],
    isCreator,
    myRole: (isCreator ? rows.creator_role : rows.partner_role) as CoupleRole | null,
    partnerRole: (isCreator ? rows.partner_role : rows.creator_role) as CoupleRole | null,
    partner: other ?? null,
    linked_at: rows.linked_at,
  };
}

/** Shape returned by the `get_my_couple()` RPC (one row, OUT-param names). */
type MyCoupleRow = {
  code: string;
  creator_id: string;
  partner_id: string | null;
  status: CoupleLink['status'];
  linked_at: string | null;
  creator_role: string | null;
  partner_role: string | null;
  couple_pack_id: string | null;
  other_id: string | null;
  other_name: string | null;
  other_avatar: string | null;
};

/** Map a `get_my_couple()` row into the in-memory `CoupleLink` shape. */
function mapCoupleRow(row: MyCoupleRow, uid: string): CoupleLink {
  const isCreator = row.creator_id === uid;
  const partner: PartnerProfile | null = row.other_id
    ? {
        id: row.other_id,
        display_name: row.other_name,
        avatar_id: row.other_avatar,
      }
    : null;

  // Re-derive the Couple entitlement on every hydration: the perk is written
  // at accept/purchase time, but a reinstall rehydrates the link from the
  // server without re-running either — so a linked couple would otherwise
  // lose it. Idempotent ("linked ⇒ entitled"). Source is derived from role:
  // the creator generated the code (paid → 'purchased', kept on unlink); the
  // accepter inherited it ('inherited' → re-locked on unlink).
  if (row.status === 'linked') {
    grantCoupleEntitlement(isCreator ? 'purchased' : 'inherited');
  }

  return {
    code: row.code,
    status: row.status,
    isCreator,
    myRole: (isCreator ? row.creator_role : row.partner_role) as CoupleRole | null,
    partnerRole: (isCreator ? row.partner_role : row.creator_role) as CoupleRole | null,
    partner,
    linked_at: row.linked_at,
  };
}

/**
 * Explicit "restore my pairing" — fetch the caller's active couple from the
 * server and push it into the store. Used by the Couple Setup screen's
 * "Restore pairing" button and an on-mount auto-attempt so a reinstalled
 * device (whose local link was wiped) can rejoin WITHOUT re-entering a code.
 * Returns the link it found (or null) so the UI can route + toast.
 */
export async function restoreCouple(): Promise<CoupleLink | null> {
  const link = await fetchActiveCouple();
  if (link) {
    useCoupleStore.getState().setLink(link);
  }
  return link;
}

/** Read the shared `couple_settings` row for `code`. */
export async function fetchCoupleSettings(code: string): Promise<{
  couplePackId: string | null;
  paused: boolean;
  thresholdM: number;
} | null> {
  const { data, error } = await supabase
    .from('couple_settings')
    .select('couple_pack_id, paused, proximity_threshold_m')
    .eq('couple_code', code)
    .maybeSingle();
  if (error || !data) return null;
  return {
    couplePackId: data.couple_pack_id ?? null,
    paused: !!data.paused,
    thresholdM: data.proximity_threshold_m ?? 100,
  };
}

/** Latest partner GPS for `code`. Returns null until the partner reports. */
export async function fetchPartnerLocation(
  code: string,
  partnerId: string,
): Promise<{
  lat: number;
  lng: number;
  updatedAt: number;
  accuracy: number | null;
} | null> {
  const { data, error } = await supabase
    .from('couple_locations')
    .select('lat, lng, accuracy_m, updated_at')
    .eq('couple_code', code)
    .eq('user_id', partnerId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    lat: data.lat,
    lng: data.lng,
    updatedAt: new Date(data.updated_at).getTime(),
    accuracy: data.accuracy_m ?? null,
  };
}
