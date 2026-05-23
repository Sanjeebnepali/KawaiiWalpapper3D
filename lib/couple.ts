import type { RealtimeChannel } from '@supabase/supabase-js';
import type { CoupleRole } from '../constants/couplePacks';
import { useSettingsStore } from '../store/settings';
import { useCoupleStore, type CoupleLink, type PartnerProfile } from '../store/couple';
import { useAuthStore } from '../store/auth';
import { hasCouplePremium } from './billing';
import { supabase } from './supabase';

/**
 * Couple proximity feature — RPC + realtime glue.
 *
 * All Supabase reads/writes go through this file so the screens don't
 * import `supabase` directly. Errors are translated from Postgres exception
 * codes (`CODE_NOT_FOUND`, `CODE_TAKEN`, …) into friendly strings the UI
 * can toast.
 *
 * Realtime: `subscribeCouple(code)` opens a single channel that watches
 * BOTH `couple_locations` (the partner's position) AND `couple_settings`
 * (shared wallpaper id, pause flag, threshold). Returns an unsubscribe
 * function — caller stores it for cleanup on unlink / app teardown.
 */

// ─── Code generation + linking ───────────────────────────────────────────

export type CreateCodeResult =
  | { ok: true; code: string }
  | { ok: false; error: string };

/**
 * Create (or re-fetch) the local user's couple code. The RPC is idempotent:
 * if the user already has a pending or linked couple, it returns the
 * existing code without overwriting its role / pack.
 *
 * Gates on `isCouplePremium` — the UI should also gate the button, but
 * we double-check here so a stale build can't bypass the paywall.
 *
 * @param role  The slot the creator wants to hold ('a' or 'b'). The
 *              partner gets the opposite slot when they accept.
 * @param packId  Optional initial pack id. If null, the dashboard's
 *                pack picker handles it later.
 */
export async function createCoupleCode(
  role: CoupleRole,
  packId: string | null = null,
): Promise<CreateCodeResult> {
  if (!hasCouplePremium()) {
    return { ok: false, error: 'Couple Premium required to generate a code.' };
  }
  if (!useAuthStore.getState().user) {
    return { ok: false, error: 'Sign in first to generate a code.' };
  }

  const { data, error } = await supabase.rpc('create_couple', {
    p_role: role,
    p_pack_id: packId,
  });
  if (error) {
    return { ok: false, error: translateError(error.message) };
  }
  if (typeof data !== 'string' || !data) {
    return { ok: false, error: 'Could not create code — try again.' };
  }

  useCoupleStore.getState().setLink({
    code: data,
    status: 'pending',
    isCreator: true,
    myRole: role,
    partnerRole: null,
    partner: null,
    linked_at: null,
  });
  useCoupleStore.getState().setCoupleSettings({ couplePackId: packId });
  return { ok: true, code: data };
}

export type AcceptCodeResult =
  | { ok: true; link: CoupleLink }
  | { ok: false; error: string };

/**
 * Accept a partner's LOVE-XXXX code. On success:
 *   1. Server flips `couples.status` to 'linked', stamps `linked_at`,
 *      assigns the partner role (auto-picks the opposite of the
 *      creator's role when `role` is null).
 *   2. Server returns the creator's profile + both roles + the active
 *      pack id so the dashboard renders without a second round-trip.
 *   3. Local flips `isCouplePremium` to true — the partner inherits
 *      the perk per the user's spec.
 *   4. Local store gets the new link state.
 *
 * @param role  Optional explicit slot pick. If omitted the server picks
 *              the opposite of the creator's role. UI offers both
 *              options when the creator's role allows it (e.g. when
 *              the partner wants to override the default).
 */
export async function acceptCoupleCode(
  rawCode: string,
  role: CoupleRole | null = null,
): Promise<AcceptCodeResult> {
  if (!useAuthStore.getState().user) {
    return { ok: false, error: 'Sign in first to link with a partner.' };
  }
  const code = normaliseCode(rawCode);
  if (!isWellFormedCode(code)) {
    return { ok: false, error: 'Code must look like LOVE-XXXX.' };
  }

  // RECONNECT-FIRST (changes/105): if the caller is ALREADY a member of the
  // couple with this code — e.g. the HOST re-entering its own code after a
  // reinstall, or a partner re-pairing a fresh install — don't try to
  // "accept" it. Accepting a couple you're already in returns CODE_TAKEN (it's
  // already 'linked'), which is the dead-end the user hit. Restore the
  // existing link from the server instead and route straight to the dashboard.
  const existing = await fetchActiveCouple();
  if (existing && existing.code === code) {
    useCoupleStore.getState().setLink(existing);
    return { ok: true, link: existing };
  }

  const { data, error } = await supabase.rpc('accept_couple_code', {
    p_code: code,
    p_role: role,
  });
  if (error) {
    return { ok: false, error: translateError(error.message) };
  }
  // RPC returns a single-row table — Supabase JS hands it back as an array.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.code) {
    return { ok: false, error: 'Could not link — try again.' };
  }

  // Inherit couple premium.
  useSettingsStore.getState().set('isCouplePremium', true);

  // From the accepter's perspective, MY role is `partner_role` and the
  // OTHER side is `creator_role`.
  const link: CoupleLink = {
    code: row.code,
    status: 'linked',
    isCreator: false,
    myRole: (row.partner_role ?? null) as CoupleRole | null,
    partnerRole: (row.creator_role ?? null) as CoupleRole | null,
    partner: {
      id: row.creator_id,
      display_name: row.creator_name,
      avatar_id: row.creator_avatar,
    },
    linked_at: row.linked_at,
  };
  useCoupleStore.getState().setLink(link);
  useCoupleStore
    .getState()
    .setCoupleSettings({ couplePackId: row.couple_pack_id ?? null });
  return { ok: true, link };
}

/**
 * Unlink — either partner can call. Status flips to 'unlinked' on the
 * server; locations are cleared; the local store is reset. Couple
 * Premium is NOT revoked locally (paid perk persists across un-pair).
 */
export async function unlinkCouple(): Promise<{ ok: boolean; error?: string }> {
  const link = useCoupleStore.getState().link;
  if (!link) return { ok: true };
  const { error } = await supabase.rpc('unlink_couple', { p_code: link.code });
  if (error) return { ok: false, error: translateError(error.message) };
  useCoupleStore.getState().reset();
  return { ok: true };
}

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
    useSettingsStore.getState().set('isCouplePremium', true);
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

  // Re-derive inherited Couple Premium on every hydration: the perk is written
  // at accept time, but a reinstall rehydrates the link from the server
  // without ever re-running accept — so a linked couple would lose the
  // inherited perk. Setting it here makes "linked ⇒ premium" idempotent.
  if (row.status === 'linked') {
    useSettingsStore.getState().set('isCouplePremium', true);
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

// ─── Mutations called from the background-location task ──────────────────

/**
 * Push the local user's GPS into Supabase. Idempotent upsert keyed on
 * `(couple_code, user_id)` so the row is always at most one per side.
 *
 * Called every 30 s by the background task in `lib/coupleLocation.ts`.
 * Returns false silently on transient failures — the next tick retries.
 */
export async function pushMyLocation(
  code: string,
  lat: number,
  lng: number,
  accuracyM: number | null,
): Promise<boolean> {
  const uid = useAuthStore.getState().user?.id;
  if (!uid) return false;
  const { error } = await supabase.from('couple_locations').upsert(
    {
      couple_code: code,
      user_id: uid,
      lat,
      lng,
      accuracy_m: accuracyM,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'couple_code,user_id' },
  );
  if (error && __DEV__) console.warn('[couple] pushMyLocation:', error.message);
  return !error;
}

/**
 * Update the couple's active pack id. Either partner can call; the
 * other phone gets the change via realtime. The pack drives BOTH the
 * solo images shown when apart AND the together image shown when
 * close, plus the role labels shown on the dashboard.
 */
export async function setCouplePack(
  code: string,
  packId: string,
): Promise<{ ok: boolean; error?: string }> {
  const uid = useAuthStore.getState().user?.id;
  if (!uid) return { ok: false, error: 'Not signed in' };
  const { error } = await supabase
    .from('couple_settings')
    .update({
      couple_pack_id: packId,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    })
    .eq('couple_code', code);
  if (error) return { ok: false, error: error.message };
  useCoupleStore.getState().setCoupleSettings({ couplePackId: packId });
  return { ok: true };
}

/** Pause / resume location sharing. Honours both partners — paused on one
 *  side is paused for both (the proximity calc forces 'far'). */
export async function setCouplePaused(
  code: string,
  paused: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('couple_settings')
    .update({ paused, updated_at: new Date().toISOString() })
    .eq('couple_code', code);
  if (error) return { ok: false, error: error.message };
  useCoupleStore.getState().setCoupleSettings({ paused });
  return { ok: true };
}

// ─── Realtime ────────────────────────────────────────────────────────────

/**
 * Subscribe to the couple's realtime channel — three tables, one channel
 * for efficient multiplexing. The returned function unsubscribes; call
 * on unlink / app teardown / partner-id change.
 *
 *   couple_locations  → partner GPS pushed every 30 s
 *   couple_settings   → shared wallpaper id / pause / threshold
 *   couples           → status flips (e.g. pending → linked) so the
 *                       creator's screen auto-advances when the partner
 *                       accepts their code
 */
export function subscribeCouple(code: string): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`couple:${code}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'couple_locations',
        filter: `couple_code=eq.${code}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as
          | {
              user_id: string;
              lat: number;
              lng: number;
              accuracy_m: number | null;
              updated_at: string;
            }
          | undefined;
        if (!row) return;
        const me = useAuthStore.getState().user?.id;
        if (row.user_id === me) return; // ignore echo of our own writes
        useCoupleStore
          .getState()
          .setPartnerLocation(
            row.lat,
            row.lng,
            new Date(row.updated_at).getTime(),
            row.accuracy_m ?? null,
          );
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'couple_settings',
        filter: `couple_code=eq.${code}`,
      },
      (payload) => {
        // A DELETE event carries the OLD row in `payload.old` and an empty
        // `payload.new` — applying it would clobber live settings (clear
        // `paused`, reset the threshold). We never delete settings rows in
        // normal operation, so just ignore deletes.
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as
          | {
              couple_pack_id?: string | null;
              paused?: boolean;
              proximity_threshold_m?: number;
            }
          | undefined;
        if (!row) return;
        // Build the patch ONLY from keys actually present in the payload. A
        // partial echo (some realtime configs send a thin row) must not be
        // read as "field went undefined" → `setCoupleSettings` would reset
        // it to the default. Each key is left out unless the server sent it.
        const patch: {
          couplePackId?: string | null;
          paused?: boolean;
          thresholdM?: number;
        } = {};
        if ('couple_pack_id' in row) {
          patch.couplePackId = row.couple_pack_id ?? null;
        }
        if ('paused' in row && row.paused !== undefined) {
          patch.paused = row.paused;
        }
        if (
          'proximity_threshold_m' in row &&
          row.proximity_threshold_m !== undefined
        ) {
          patch.thresholdM = row.proximity_threshold_m;
        }
        useCoupleStore.getState().setCoupleSettings(patch);
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'couples',
        filter: `code=eq.${code}`,
      },
      async (payload) => {
        const row = payload.new as
          | {
              status: string;
              partner_id: string | null;
              linked_at: string | null;
            }
          | undefined;
        if (!row) return;
        // The interesting case: pending → linked on the creator's side.
        // Re-fetch the full link via fetchActiveCouple so the partner
        // profile lands in the store too.
        if (row.status === 'linked') {
          const link = await fetchActiveCouple();
          if (link) useCoupleStore.getState().setLink(link);
        } else if (row.status === 'unlinked') {
          useCoupleStore.getState().reset();
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

const CODE_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;

export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isWellFormedCode(code: string): boolean {
  if (!code.startsWith('LOVE-')) return false;
  const tail = code.slice(5);
  return tail.length === 4 && CODE_ALPHABET.test(tail);
}

/**
 * Translate a Postgres `raise exception '…'` from the RPCs into something
 * the toast can show. Any unknown message falls through unchanged so we
 * don't hide real bugs from the user.
 */
function translateError(msg: string): string {
  if (msg.includes('CODE_NOT_FOUND')) return 'No couple with that code.';
  if (msg.includes('CODE_TAKEN')) return 'That code is already taken.';
  if (msg.includes('CODE_REVOKED')) return 'That code was unlinked.';
  if (msg.includes('CANNOT_LINK_SELF')) return "You can't link with yourself.";
  if (msg.includes('ALREADY_LINKED')) return 'You already have an active link.';
  if (msg.includes('NOT_AUTHENTICATED')) return 'Sign in first.';
  if (msg.includes('NOT_YOUR_COUPLE')) return 'This is not your couple.';
  if (msg.includes('BAD_ROLE')) return 'Pick a side first.';
  if (msg.includes('ROLE_TAKEN'))
    return 'Your partner already chose that side — pick the other one.';
  return msg;
}
