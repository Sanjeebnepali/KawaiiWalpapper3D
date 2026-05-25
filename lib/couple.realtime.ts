/**
 * Couple realtime subscription.
 *
 * Opens one Supabase realtime channel multiplexed across three tables.
 * Depends on `fetchActiveCouple` from `couple.hydration.ts` (to re-fetch the
 * full link when the creator's row flips pending → linked); it does NOT
 * import back from `lib/couple.ts`, so there is no import cycle. Re-exported
 * from `lib/couple.ts` so external importers keep working unchanged.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCoupleStore } from '../store/couple';
import { useAuthStore } from '../store/auth';
import { reconcileCoupleEntitlement } from './billing';
import { supabase } from './supabase';
import { fetchActiveCouple } from './couple.hydration';

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
          // The partner unlinked us while the app was open: re-lock an
          // inherited Couple entitlement (a buyer keeps it). Same rule as
          // unlinkCouple — this is the device that did NOT initiate.
          reconcileCoupleEntitlement(false);
        }
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
