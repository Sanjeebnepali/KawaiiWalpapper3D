/**
 * Foreground-service control for shuffle — extracted from `shuffleActions.ts`.
 *
 * Solves the "OEM background killer eats the WorkManager job" problem on
 * Vivo / MIUI / ColorOS. The native foreground service in
 * `modules/shuffle-foreground/` keeps a 1-min-min Handler.postDelayed
 * loop alive with a low-priority ongoing notification, which OEMs respect
 * (their killers explicitly exempt foreground services with an active
 * notification).
 *
 * JS contract:
 *   1. When a shuffle is activated → pre-cache all 10 photoIds (download
 *      remote URLs into cacheDirectory, gallery / internet URIs are
 *      already local and pass through), then call `startShuffleForeground`
 *      with the resolved file:// URI list.
 *   2. When the shuffle is deactivated → call `stopShuffleForeground`.
 *   3. The native service is the SOURCE OF TRUTH for rotation while the
 *      app is closed.
 *
 * On platforms without the native module (iOS / pre-rebuild dev session)
 * `startShuffleForeground` returns false and JS falls back to the existing
 * bg-fetch + AppState resume path.
 */
import {
  isShuffleForegroundAvailable,
  startShuffleForeground,
  stopShuffleForeground,
} from '../modules/shuffle-foreground';
import { getPhotoById } from '../constants/mockData';
import {
  type Collection,
  getCollectionIntervalMinutes,
} from '../constants/shuffle';
import { downloadToCache } from './wallpaperActions';
import { useShuffleStore } from '../store/shuffle';

/**
 * Resolve a list of photo IDs to local cacheDirectory `file://` URIs.
 *
 *   - file:// IDs              → already on disk, returned unchanged.
 *   - content:// IDs           → copied to a file:// cache path via
 *     downloadToCache. The native FGS only decodes file://`/`/` paths;
 *     a raw content:// grant decodes to null in the service process (the
 *     scoped-storage permission doesn't survive into the revived process),
 *     so the slot silently applied nothing while the app was closed. Copy
 *     to a real file before it ever reaches the service.
 *   - http:// / https:// IDs   → downloaded (skipped on failure).
 *   - catalog IDs (e.g. 'mood-happy-3') → resolved to picsum URL via
 *     getPhotoById, then downloaded.
 *
 * Returns ONLY successfully-resolved local URIs — failed downloads /
 * unresolvable IDs are dropped silently so the service has a usable
 * pool even if some photos couldn't be fetched.
 */
export async function precacheCollection(
  photoIds: string[],
): Promise<string[]> {
  const results = await Promise.all(
    photoIds.map(async (id) => {
      if (id.startsWith('file://')) {
        return id;
      }
      if (id.startsWith('content://')) {
        // The id IS the URI; downloadToCache copies the content:// grant
        // to a stable file:// cache path the native service can decode.
        try {
          return await downloadToCache(id, id);
        } catch {
          return null;
        }
      }
      const photo = getPhotoById(id);
      if (!photo) return null;
      try {
        return await downloadToCache(photo.image, photo.id);
      } catch {
        return null;
      }
    }),
  );
  return results.filter((u): u is string => typeof u === 'string');
}

/**
 * Activate the foreground-service rotation for a Collection. Idempotent —
 * calling repeatedly with the same payload just restarts the service
 * with fresh state. Returns true if the service is now running.
 */
export async function startForegroundShuffleForCollection(
  collection: Collection,
): Promise<boolean> {
  if (!isShuffleForegroundAvailable) return false;
  const uris = await precacheCollection(collection.photoIds);
  if (uris.length === 0) return false;
  const intervalMs = getCollectionIntervalMinutes(collection) * 60_000;
  const startIndex = Math.min(
    useShuffleStore.getState().currentIndex,
    uris.length - 1,
  );
  return startShuffleForeground({
    uris,
    intervalMs,
    mode: collection.mode,
    startIndex,
  });
}

/** Stop the foreground rotation. Safe to call when not running. */
export function stopForegroundShuffle(): void {
  if (!isShuffleForegroundAvailable) return;
  stopShuffleForeground();
}
