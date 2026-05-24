import * as Location from 'expo-location';
import { supabase } from './supabase';
import { useAuthStore } from '../store/auth';
import { useCoupleStore } from '../store/couple';
import { haversineMeters } from '../store/couple';

/**
 * Live couple-connection check — the release-visible diagnostic.
 *
 * The proximity feature fails SILENTLY in a release build: every error in the
 * push / read / realtime path is `if (__DEV__) console.warn(...)`, which is
 * stripped from the production bundle. So when "distance shows the default and
 * never changes", there's no signal as to WHICH link broke.
 *
 * This runs the actual end-to-end round-trip ONCE, on demand, capturing the
 * RAW Supabase/Postgres error messages (not the swallowed booleans the normal
 * path returns). It tells us, in order:
 *   1. signed in?  2. linked + partner id present?  3. can we read our GPS?
 *   4. can we WRITE it to the server (RLS write-block shows here)?
 *   5. can we READ the partner's row (RLS read-block / "they're offline"
 *      shows here)?  6. the resulting straight-line distance.
 *
 * Read identically on both phones, the output pinpoints the fault: a write
 * that fails on one side, or a partner-read that's empty/blocked on both, is
 * the difference between "their phone isn't sending" and "the server won't
 * let us see it" (a row-level-security policy that needs fixing in Supabase).
 */
export type CoupleConnectionCheck = { lines: string[]; ok: boolean };

export async function runCoupleConnectionCheck(): Promise<CoupleConnectionCheck> {
  const lines: string[] = [];
  let ok = true;
  const fail = (msg: string) => {
    lines.push(`✗ ${msg}`);
    ok = false;
  };
  const pass = (msg: string) => lines.push(`✓ ${msg}`);

  const uid = useAuthStore.getState().user?.id ?? null;
  if (!uid) {
    fail('Not signed in — the server needs an account to share location.');
    return { lines, ok };
  }
  pass('Signed in.');

  const link = useCoupleStore.getState().link;
  if (!link || link.status !== 'linked') {
    fail('Not linked to a partner.');
    return { lines, ok };
  }
  pass(`Linked (${link.code}).`);

  const partnerId = link.partner?.id ?? null;
  if (!partnerId) fail('Partner id missing — re-pair or restore the link.');

  // 1) Our own GPS.
  let lat: number | null = null;
  let lng: number | null = null;
  let acc: number | null = null;
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
    acc = pos.coords.accuracy ?? null;
    pass(`My GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${acc != null ? Math.round(acc) : '?'} m).`);
  } catch (e) {
    fail(`My GPS unavailable — ${(e as Error)?.message ?? 'unknown error'}.`);
  }

  // 2) Write it to the server (this is where an RLS write-block surfaces).
  if (lat != null && lng != null) {
    const { error } = await supabase.from('couple_locations').upsert(
      {
        couple_code: link.code,
        user_id: uid,
        lat,
        lng,
        accuracy_m: acc,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'couple_code,user_id' },
    );
    if (error) fail(`Send to server blocked — ${error.message}`);
    else pass('Sent my location to the server.');
  }

  // 3) Read the partner's row (RLS read-block OR "they haven't sent" surfaces).
  if (partnerId) {
    const { data, error } = await supabase
      .from('couple_locations')
      .select('lat, lng, updated_at')
      .eq('couple_code', link.code)
      .eq('user_id', partnerId)
      .maybeSingle();
    if (error) {
      fail(`Reading partner location blocked — ${error.message}`);
    } else if (!data) {
      fail("Partner's location is empty — their phone hasn't sent yet, or the server is hiding it from you.");
    } else {
      const ageS = Math.round((Date.now() - new Date(data.updated_at).getTime()) / 1000);
      pass(`Got partner location, updated ${ageS}s ago.`);
      if (lat != null && lng != null) {
        const d = Math.round(haversineMeters(lat, lng, data.lat, data.lng));
        lines.push(`→ Straight-line distance right now: ${d} m.`);
      }
    }
  }

  return { lines, ok };
}
