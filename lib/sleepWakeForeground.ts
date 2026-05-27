/**
 * Resolver bridge between the mood store and the native Sleep/Wake
 * foreground service (`modules/sleep-wake-foreground/`).
 *
 * The native service rotates only LOCAL `file://` URIs (decoded via
 * `BitmapFactory.decodeFile`), so JS pre-resolves the wake + sleep
 * image references — curated pack URLs OR the user's custom-pair photo
 * IDs — into cache file paths before passing them to the service.
 *
 * Mirrors the `startForegroundShuffleForCollection` shape in
 * `lib/shuffleActions.ts` so the wiring in `lib/moodBootstrap.ts` stays
 * symmetric: bootstrap calls the start helper when toggle/pack/hour
 * flips ON, the stop helper when it flips OFF or the params become
 * invalid.
 */

import { getPhotoById } from '../constants/mockData';
import {
  CUSTOM_SLEEP_WAKE_ID,
  getSleepWakePack,
} from '../constants/sleepWakePacks';
import { useMoodStore } from '../store/mood';
import {
  startSleepWakeForeground as nativeStart,
  stopSleepWakeForeground as nativeStop,
  isSleepWakeForegroundAvailable,
} from '../modules/sleep-wake-foreground';
import { downloadToPersistent } from './wallpaperActions';

export { isSleepWakeForegroundAvailable };

/** Resolve the active wake + sleep image references into local file://
 *  URIs. Returns null if either is missing — the service refuses to
 *  start with a half-configured payload. */
async function resolveSleepWakeUris(
  packId: string,
): Promise<{ wakeUri: string; sleepUri: string } | null> {
  // CUSTOM pair — IDs come from the mood store. Two flavours:
  //   - direct file:// / content:// URI (user picked from gallery)
  //   - catalog photo ID (resolved via getPhotoById)
  if (packId === CUSTOM_SLEEP_WAKE_ID) {
    const s = useMoodStore.getState();
    const wakeRef = s.sleepWakeCustomWakeId;
    const sleepRef = s.sleepWakeCustomSleepId;
    if (!wakeRef || !sleepRef) return null;
    const wakeImage = isDirectUri(wakeRef)
      ? wakeRef
      : getPhotoById(wakeRef)?.image;
    const sleepImage = isDirectUri(sleepRef)
      ? sleepRef
      : getPhotoById(sleepRef)?.image;
    if (!wakeImage || !sleepImage) return null;
    return precachePair(wakeImage, sleepImage, `sw-custom-${wakeRef}-${sleepRef}`);
  }

  // Curated pack — wakeImage / sleepImage are remote http URLs.
  const pack = getSleepWakePack(packId);
  if (!pack) return null;
  return precachePair(pack.wakeImage, pack.sleepImage, `sw-pack-${pack.id}`);
}

function isDirectUri(s: string): boolean {
  return s.startsWith('file://') || s.startsWith('content://');
}

async function precachePair(
  wakeRef: string,
  sleepRef: string,
  idSeed: string,
): Promise<{ wakeUri: string; sleepUri: string } | null> {
  try {
    // PERSISTENT dir, not cache: the service decodes these files at the
    // scheduled wake/sleep hour — often many hours after this runs — and the
    // OS evicts the cache dir while we're backgrounded (the "Sleep/Wake only
    // fires if I open the app" bug). documentDirectory survives until uninstall.
    const [wakeUri, sleepUri] = await Promise.all([
      downloadToPersistent(wakeRef, `${idSeed}-wake`),
      downloadToPersistent(sleepRef, `${idSeed}-sleep`),
    ]);
    if (!wakeUri || !sleepUri) return null;
    return { wakeUri, sleepUri };
  } catch (e) {
    if (__DEV__) console.warn('[sleepWakeFG] precache failed:', e);
    return null;
  }
}

/**
 * Start the foreground service with the currently-configured Sleep/Wake
 * pack and hours from the mood store. No-op on iOS / pre-rebuild builds
 * where the native module isn't linked.
 *
 * Returns true if the service was started, false otherwise. Callers
 * (currently just `lib/moodBootstrap.ts`) don't strictly need the
 * return value — failures are silent and the bg-task + tap fallbacks
 * still work.
 */
export async function startSleepWakeForegroundFromStore(): Promise<boolean> {
  if (!isSleepWakeForegroundAvailable) return false;
  const s = useMoodStore.getState();
  if (!s.sleepWakeEnabled || !s.sleepWakePackId) return false;

  const uris = await resolveSleepWakeUris(s.sleepWakePackId);
  if (!uris) return false;

  return startSleepWakeForeground({
    wakeUri: uris.wakeUri,
    sleepUri: uris.sleepUri,
    wakeHour: s.sleepWakeWakeHour,
    sleepHour: s.sleepWakeSleepHour,
  });
}

/** Re-export the raw bridge so callers that already have local URIs
 *  can skip the resolution step. */
export function startSleepWakeForeground(opts: {
  wakeUri: string;
  sleepUri: string;
  wakeHour: number;
  sleepHour: number;
}): boolean {
  return nativeStart(opts);
}

export function stopSleepWakeForeground(): void {
  nativeStop();
}
