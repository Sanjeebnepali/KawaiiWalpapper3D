import * as Location from 'expo-location';
import { fetchPartnerLocation } from './couple';
import { recordMyFix } from './coupleMyFix';
import { useAuthStore } from '../store/auth';
import { useCoupleStore } from '../store/couple';

/**
 * Foreground "live distance" mode — the Uber-style fast refresh.
 *
 * The background location stream (`lib/coupleLocation.ts`) runs at a
 * deliberately slow 15 s / 25 s cadence so an always-on linked session
 * doesn't drain the battery. That's correct when the app is closed, but it
 * makes the distance LAG by tens of seconds while the user is actively
 * watching the dashboard — it feels frozen.
 *
 * While the Couple dashboard is focused we switch to a fast loop (every
 * `LIVE_INTERVAL_MS`): on each tick we, in parallel,
 *   1. take a FRESH high-accuracy fix of our own position, update the store
 *      (instant local recompute) and push it so the partner sees us move; and
 *   2. pull the partner's latest row and update the store.
 * Both feed `recomputeDistance`, so the number tracks reality within a few
 * seconds — like the driver pin closing in. On screen blur / unmount we stop,
 * and the slow background cadence takes over again. Battery cost is bounded to
 * "screen on, looking at this one screen", exactly when it's worth paying.
 *
 * Module-scoped singleton timer (not per-component state) so a quick
 * blur→focus or a re-render never stacks two loops.
 */
const LIVE_INTERVAL_MS = 1500;

let liveTimer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

async function liveTick(): Promise<void> {
  // Reentrancy guard: a GPS fix can take longer than the interval; never let
  // a slow tick overlap the next one.
  if (ticking) return;
  ticking = true;
  try {
    const link = useCoupleStore.getState().link;
    if (!link || link.status !== 'linked') return;
    if (useCoupleStore.getState().paused) return;
    if (!useAuthStore.getState().user?.id) return;

    const code = link.code;
    const partnerId = link.partner?.id ?? null;

    await Promise.all([
      // 1) Our own fresh position → store + server.
      (async () => {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }).catch(() => null);
        if (!pos) return;
        const { latitude, longitude, accuracy } = pos.coords;
        // Smooth + store + push through the shared funnel (Kalman-filtered).
        await recordMyFix(code, latitude, longitude, accuracy ?? null);
      })(),
      // 2) Partner's latest position → store. Realtime also delivers this,
      //    but polling here guarantees freshness even if an event is missed.
      (async () => {
        if (!partnerId) return;
        const loc = await fetchPartnerLocation(code, partnerId).catch(() => null);
        if (!loc) return;
        useCoupleStore
          .getState()
          .setPartnerLocation(loc.lat, loc.lng, loc.updatedAt, loc.accuracy);
      })(),
    ]);
  } finally {
    ticking = false;
  }
}

/** Begin fast foreground refresh. Idempotent — a second call is a no-op. */
export function startCoupleLiveTracking(): void {
  if (liveTimer) return;
  void liveTick(); // refresh immediately, don't wait a full interval
  liveTimer = setInterval(() => void liveTick(), LIVE_INTERVAL_MS);
}

/** Stop fast refresh; the slow background cadence keeps the distance alive. */
export function stopCoupleLiveTracking(): void {
  if (liveTimer) {
    clearInterval(liveTimer);
    liveTimer = null;
  }
}
