import { useCoupleStore } from '../store/couple';
import { pushMyLocation } from './couple';
import { smoothMyFix } from './gpsFilter';

/**
 * Single funnel for the local user's GPS. Every place a fix for US arrives
 * (foreground live loop, background location task, the startup seed) calls
 * this so:
 *   1. the raw fix is Kalman-smoothed (one shared filter = one ordered stream,
 *      so the distance stops bouncing on GPS noise), then
 *   2. the smoothed position is written to the store (drives the live
 *      distance) AND pushed to the server so the partner sees the clean value.
 *
 * Keeping it in one place means the filter can never be bypassed by one of the
 * three entry points, which would reintroduce the jitter on that path.
 */
export async function recordMyFix(
  code: string,
  lat: number,
  lng: number,
  accuracyM: number | null,
): Promise<void> {
  const s = smoothMyFix(lat, lng, accuracyM, Date.now());
  useCoupleStore.getState().setMyLocation(s.lat, s.lng, s.accuracy);
  await pushMyLocation(code, s.lat, s.lng, s.accuracy);
}
