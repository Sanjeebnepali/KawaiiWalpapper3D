import type { CoupleRole } from '../constants/couplePacks';
import { useCoupleStore, type CoupleLink } from '../store/couple';
import { useAuthStore } from '../store/auth';
import {
  grantCoupleEntitlement,
  hasCouplePremium,
  reconcileCoupleEntitlement,
} from './billing';
import { supabase } from './supabase';
import {
  isWellFormedCode,
  normaliseCode,
  translateError,
  type AcceptCodeResult,
  type CreateCodeResult,
} from './couple.codes';
import { fetchActiveCouple } from './couple.hydration';

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
 *
 * Companion modules (re-exported below so `lib/couple` keeps its full
 * public API): code-format + error helpers in `couple.codes.ts`; the
 * cold-start / restore reads in `couple.hydration.ts`; the realtime
 * channel subscription in `couple.realtime.ts`.
 */

// Re-export the public surface moved to sibling files so every external
// importer of `lib/couple` keeps working unchanged.
export type { CreateCodeResult, AcceptCodeResult } from './couple.codes';
export { normaliseCode, isWellFormedCode } from './couple.codes';
export {
  fetchActiveCouple,
  restoreCouple,
  fetchCoupleSettings,
  fetchPartnerLocation,
} from './couple.hydration';
export { subscribeCouple } from './couple.realtime';

// ─── Code generation + linking ───────────────────────────────────────────

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

/**
 * Accept a partner's LOVE-XXXX code. On success:
 *   1. Server flips `couples.status` to 'linked', stamps `linked_at`,
 *      assigns the partner role (auto-picks the opposite of the
 *      creator's role when `role` is null).
 *   2. Server returns the creator's profile + both roles + the active
 *      pack id so the dashboard renders without a second round-trip.
 *   3. Local grants the Couple entitlement with an 'inherited' source — the
 *      partner inherits the perk while linked, but it is revoked when the
 *      pair ends (only the buyer keeps it). See reconcileCoupleEntitlement.
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

  // Inherit Couple Premium with an 'inherited' source: the partner unlocks it
  // for free while linked, and it is re-locked when the pair ends (the buyer
  // keeps it; the partner doesn't). A user who actually PURCHASED couple (or
  // holds All Access) stays 'purchased' — grantCoupleEntitlement guards that.
  grantCoupleEntitlement('inherited');

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
 * server; locations are cleared; the local store is reset.
 *
 * Couple entitlement is then reconciled: a buyer (or All Access holder) KEEPS
 * it, but a partner who only INHERITED it via a code is re-locked now that the
 * pair has ended. The partner's OTHER device learns of the unlink via the
 * realtime `status → unlinked` handler (or, if it was closed, the next
 * cold-start reconcile in coupleBootstrap) — both call the same function.
 */
export async function unlinkCouple(): Promise<{ ok: boolean; error?: string }> {
  const link = useCoupleStore.getState().link;
  if (!link) return { ok: true };
  const { error } = await supabase.rpc('unlink_couple', { p_code: link.code });
  if (error) return { ok: false, error: translateError(error.message) };
  useCoupleStore.getState().reset();
  reconcileCoupleEntitlement(false);
  return { ok: true };
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

/**
 * Switch which side (role 'a' / 'b' → e.g. Boy / Girl) the local user is, AFTER
 * linking. The two roles must stay opposite (the `couples_roles_differ_check`
 * constraint + the "two halves complete the picture" design), so picking my
 * side also flips the partner to the other one — written in a single update so
 * the post-update row never violates the differ constraint.
 *
 * Uses the "couples: update own" RLS policy (a member may update their couple
 * row), so no new RPC is needed. The partner receives the swap via the
 * `couples` realtime channel (status stays 'linked' → re-fetch → setLink), and
 * both phones re-apply the wallpaper via the myRole-change subscriber in
 * `coupleBootstrap`.
 */
export async function setMyCoupleRole(
  role: CoupleRole,
): Promise<{ ok: boolean; error?: string }> {
  const link = useCoupleStore.getState().link;
  if (!link || link.status !== 'linked') {
    return { ok: false, error: 'Not linked yet' };
  }
  const opposite: CoupleRole = role === 'a' ? 'b' : 'a';
  const creatorRole = link.isCreator ? role : opposite;
  const partnerRole = link.isCreator ? opposite : role;

  const { error } = await supabase
    .from('couples')
    .update({ creator_role: creatorRole, partner_role: partnerRole })
    .eq('code', link.code);
  if (error) return { ok: false, error: error.message };

  // Reflect locally at once; realtime echoes the same values to both phones.
  useCoupleStore
    .getState()
    .setLink({ ...link, myRole: role, partnerRole: opposite });
  return { ok: true };
}
