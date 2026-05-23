import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { getBufferZone, useCoupleStore } from '../store/couple';
import { pushMyLocation } from './couple';
import { applyProximityWallpaper } from './coupleWallpaper';

/**
 * Battery-efficient background GPS for the couple proximity feature.
 *
 * Strategy:
 *   1. A TaskManager-defined task receives Location updates from
 *      `Location.startLocationUpdatesAsync`. iOS / Android both deliver
 *      these on a sensor-driven cadence, NOT a wall-clock interval — so
 *      we get roughly one update every 30 s when the user is moving and
 *      MUCH less frequent updates when they're stationary (which is the
 *      battery-efficient behaviour the spec asks for).
 *   2. Each update pushes to Supabase via `pushMyLocation` and updates
 *      the local store. The store's `setMyLocation` re-computes
 *      Haversine distance against the last known partner GPS, which
 *      drives the proximity-state machine in `lib/coupleWallpaper.ts`.
 *   3. A geofence around the partner's last known position lets the OS
 *      wake us on enter/exit instead of polling — that's the real
 *      battery win. Geofence radius = proximity threshold from
 *      `couple_settings.proximity_threshold_m` (default 100 m).
 *
 * Why expo-location and not react-native-background-geolocation:
 *   - expo-location is built into the Expo SDK, no paid licence.
 *   - `accuracy: Balanced` + the distance/time filter below gives the
 *     same "low power, wake on motion" semantics the paid lib does.
 *   - Works on iOS background modes + Android FOREGROUND_SERVICE_LOCATION
 *     out of the box (Expo prebuild adds the manifest entries from
 *     app.json plugin config).
 *
 * IMPORTANT: this module ALSO needs the `expo-location` config plugin in
 * `app.json` (see changes/077 verification steps) so the
 * ACCESS_BACKGROUND_LOCATION permission + foreground-service-type
 * manifest entry get baked into the APK on the next native rebuild.
 */

export const COUPLE_LOCATION_TASK = 'kawaii.couple.location.v1';
export const COUPLE_GEOFENCE_TASK = 'kawaii.couple.geofence.v1';

// ─── TaskManager handlers (registered once at module load) ───────────────

type LocationTaskPayload = {
  data?: { locations?: Location.LocationObject[] };
  error?: TaskManager.TaskManagerError | null;
};

if (!TaskManager.isTaskDefined(COUPLE_LOCATION_TASK)) {
  TaskManager.defineTask(
    COUPLE_LOCATION_TASK,
    async ({ data, error }: LocationTaskPayload) => {
      if (error) {
        if (__DEV__) console.warn('[coupleLoc] task error:', error.message);
        return;
      }
      const loc = data?.locations?.[0];
      if (!loc) return;
      const link = useCoupleStore.getState().link;
      if (!link || link.status !== 'linked') return;
      if (useCoupleStore.getState().paused) return;

      const { latitude, longitude, accuracy } = loc.coords;
      // Feed accuracy into the store too — it picks the dynamic buffer band.
      useCoupleStore.getState().setMyLocation(latitude, longitude, accuracy ?? null);
      await pushMyLocation(link.code, latitude, longitude, accuracy ?? null);
      // Re-arm the geofence on every local tick so its radius tracks the
      // LATEST accuracy band. The bootstrap subscriber only re-arms when the
      // PARTNER's pin moves; if OUR accuracy degrades (e.g. walking indoors)
      // the band should widen, but without this the geofence keeps its stale
      // radius and the OS enter/exit wake fires at a different distance than
      // `recomputeDistance` flips on. Cheap + idempotent (stop+start).
      await refreshCoupleGeofence();
      // The wallpaper handler is idempotent — it only writes when the
      // computed proximity state actually flipped since the last write,
      // so calling it on every tick is cheap.
      await applyProximityWallpaper();
    },
  );
}

type GeofenceTaskPayload = {
  data?: {
    eventType?: Location.GeofencingEventType;
    region?: Location.LocationRegion;
  };
  error?: TaskManager.TaskManagerError | null;
};

if (!TaskManager.isTaskDefined(COUPLE_GEOFENCE_TASK)) {
  TaskManager.defineTask(
    COUPLE_GEOFENCE_TASK,
    async ({ data, error }: GeofenceTaskPayload) => {
      if (error) {
        if (__DEV__) console.warn('[coupleGeo] task error:', error.message);
        return;
      }
      // Defence-in-depth: bail before doing anything if the couple is
      // paused. `applyProximityWallpaper` already forces 'far' when paused,
      // but short-circuiting here means a geofence wake can't even trigger a
      // wallpaper re-evaluation while sharing is off.
      if (useCoupleStore.getState().paused) return;
      // The "near"/"far" decision happens entirely from store state — the
      // store has both sides' GPS, so we just trigger a fresh apply.
      // OS-driven wakes are the whole point of the geofence (no polling).
      await applyProximityWallpaper();
    },
  );
}

// ─── Public start / stop / refresh ───────────────────────────────────────

/**
 * Ask for permission + start the background location updates. Returns the
 * actual granted status so the caller can show "Background location
 * denied — open Settings" if the user said "Only this time."
 */
export async function ensureBackgroundLocationPermission(): Promise<
  'granted' | 'foreground-only' | 'denied'
> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';
  // Background is a separate request on Android 10+ / iOS. Either
  // request can return "denied" or "undetermined".
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.granted) return 'granted';
  return 'foreground-only';
}

/**
 * Start streaming location updates to the task. Safe to call repeatedly —
 * `hasStarted` short-circuits if the task is already running. The
 * `accuracy: Balanced` + filter combination is the recommended low-power
 * profile for "I want to know when they're nearby" rather than
 * "I want a turn-by-turn track."
 */
export async function startCoupleLocation(): Promise<boolean> {
  const link = useCoupleStore.getState().link;
  if (!link || link.status !== 'linked') return false;

  const already = await Location.hasStartedLocationUpdatesAsync(
    COUPLE_LOCATION_TASK,
  );
  if (already) return true;

  await Location.startLocationUpdatesAsync(COUPLE_LOCATION_TASK, {
    accuracy: Location.Accuracy.Balanced,
    // ~5-second cadence so the distance feels LIVE while the couple feature
    // is active (the owner expected real-time updates; the old 30s/25m filter
    // froze the distance when both phones were stationary). The OS still
    // throttles under Doze when the screen is off, so the battery hit is
    // bounded to active use. distanceInterval:0 → emit on every fix (don't
    // require movement), which is what makes a stationary "4 m" keep refreshing
    // its timestamp and lets proximity re-evaluate continuously.
    timeInterval: 5_000,
    distanceInterval: 0,
    // Persistent foreground-service notification (Android only). Lets
    // the OS keep delivering updates while the screen is off without
    // killing us under Doze.
    foregroundService: {
      notificationTitle: 'Couple proximity',
      notificationBody: 'Sharing location with your partner',
      notificationColor: '#fab3ca',
    },
    // Keep delivering fixes even when the phone is stationary. With this true,
    // some OEMs (e.g. Vivo Funtouch) PAUSE updates on a still phone → the
    // distance never appears. We want a live distance whenever the feature is
    // active, so don't let the OS pause us.
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
  });

  // Seed an IMMEDIATE position so the dashboard shows a distance right away
  // instead of waiting for the movement-driven stream's first emit (which can
  // take a long time, or never come, on a stationary phone). Fire-and-forget
  // so it never blocks startup; try a fresh fix, fall back to last-known.
  void (async () => {
    try {
      const pos =
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null)) ??
        (await Location.getLastKnownPositionAsync());
      if (!pos) return;
      const cur = useCoupleStore.getState().link;
      if (!cur || cur.status !== 'linked') return;
      const { latitude, longitude, accuracy } = pos.coords;
      useCoupleStore.getState().setMyLocation(latitude, longitude, accuracy ?? null);
      await pushMyLocation(cur.code, latitude, longitude, accuracy ?? null);
      await applyProximityWallpaper();
    } catch {
      /* best-effort seed — the stream + geofence still drive updates */
    }
  })();

  return true;
}

export async function stopCoupleLocation(): Promise<void> {
  const already = await Location.hasStartedLocationUpdatesAsync(
    COUPLE_LOCATION_TASK,
  );
  if (already) {
    await Location.stopLocationUpdatesAsync(COUPLE_LOCATION_TASK);
  }
  const geofenced = await Location.hasStartedGeofencingAsync(
    COUPLE_GEOFENCE_TASK,
  );
  if (geofenced) {
    await Location.stopGeofencingAsync(COUPLE_GEOFENCE_TASK);
  }
}

/**
 * Re-arm the geofence around the partner's latest known position. Called
 * whenever the partner's location updates (via the realtime subscription
 * in `lib/couple.ts:subscribeCouple`) — the geofence stays centred on
 * "where they currently are" so an enter/exit event fires when WE cross
 * the threshold around THEIR pin.
 *
 * The OS gives us the enter/exit dispatch entirely for free; that's
 * the difference between "polling every 30 s" (constant battery) and
 * "OS wakes us at the boundary" (zero battery until something happens).
 */
export async function refreshCoupleGeofence(): Promise<void> {
  const s = useCoupleStore.getState();
  const { link, partnerLat, partnerLng, myAccuracy, partnerAccuracy, thresholdM } = s;
  if (!link || link.status !== 'linked') return;
  if (partnerLat == null || partnerLng == null) return;

  // Size the geofence to the FAR edge of the dynamic buffer band so the OS
  // wakes us at the same boundary the wallpaper logic flips on. Use the
  // worse of the two accuracies AND the configured threshold, matching
  // `recomputeDistance` exactly so the geofence and the in-app calc agree.
  const accs = [myAccuracy, partnerAccuracy].filter(
    (a): a is number => a != null && Number.isFinite(a),
  );
  const { far } = getBufferZone(
    accs.length ? Math.max(...accs) : null,
    thresholdM,
  );

  const already = await Location.hasStartedGeofencingAsync(
    COUPLE_GEOFENCE_TASK,
  );
  if (already) {
    await Location.stopGeofencingAsync(COUPLE_GEOFENCE_TASK);
  }
  await Location.startGeofencingAsync(COUPLE_GEOFENCE_TASK, [
    {
      identifier: 'partner',
      latitude: partnerLat,
      longitude: partnerLng,
      radius: far,
      notifyOnEnter: true,
      notifyOnExit: true,
    },
  ]);
}
