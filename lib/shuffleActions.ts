import {
  getLastAppliedShuffle,
  isShuffleForegroundAvailable,
  isShuffleForegroundRunning,
  startShuffleForeground,
  stopShuffleForeground,
} from '../modules/shuffle-foreground';
import { getPhotoById } from '../constants/mockData';
import {
  type Collection,
  getCollectionIntervalMinutes,
  getNextChangeAt,
  isInDnd,
  parseHHMM,
  type ShuffleMode,
} from '../constants/shuffle';
import { downloadToCache, setAsWallpaper } from './wallpaperActions';
import { hydrateShuffleStore, useShuffleStore } from '../store/shuffle';

/**
 * Apply the photo at a specific index of a collection and record it into
 * shuffle history. Used to give the user instant feedback the moment they
 * tap "Shuffle" on a theme pack or "Start" on a custom collection —
 * without this, nothing visible happens until the first timer tick (which
 * can be 60+ minutes away on the default interval).
 *
 * Returns `{ ok, message }` so the caller can toast either way.
 */
export async function applyCollectionPhoto(
  collectionId: string,
  photoIds: string[],
  index: number,
): Promise<{ ok: boolean; message: string }> {
  const photoId = photoIds[index];
  if (!photoId) return { ok: false, message: 'Collection is empty' };
  const photo = getPhotoById(photoId);
  if (!photo) return { ok: false, message: 'Photo not found' };

  const r = await setAsWallpaper(photo.image, photo.id, 'both');
  if (!r.ok) return r;

  useShuffleStore.getState().recordChange(
    {
      photoId: photo.id,
      image: photo.image,
      at: Date.now(),
      collectionId,
    },
    index,
  );
  return r;
}

// ─── Background / resume tick ────────────────────────────────────────────
//
// Foreground ticking (10 s interval) lives in `hooks/useShuffleEngine.ts`.
// This helper is a SINGLE-SHOT version of that same "is the active
// shuffle due? advance it" check, used by:
//   1. `lib/moodBackgroundTask.ts` — OS-scheduled background fetches piggy-
//      back on the existing mood task so when the app is fully closed and
//      the timer interval elapses, the wallpaper still rotates.
//   2. `hooks/useShuffleEngine.ts` AppState='active' listener — on app
//      resume, fire IMMEDIATELY instead of waiting up to 10 s for the
//      foreground ticker to wake up. Closes the "I opened the app and the
//      wallpaper only changed after I looked at the shuffle screen" gap.
//
// Returns true iff a new wallpaper was applied this tick.

function pickNextShuffleIndex(
  mode: ShuffleMode,
  currentIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  switch (mode) {
    case 'sequential':
      return (currentIndex + 1) % count;
    case 'random': {
      if (count === 1) return 0;
      let n = Math.floor(Math.random() * count);
      if (n === currentIndex) n = (n + 1) % count;
      return n;
    }
    case 'day':
      // One new image per day — the day boundary (midnight) is what fires
      // this tick (see getNextChangeAt), so step by one to walk the whole
      // collection day by day. (Was weekday-modulo, which froze on one image
      // all day and never used images past the 7th.)
      return (currentIndex + 1) % count;
    case 'smart': {
      const hour = new Date().getHours();
      const day = hour >= 6 && hour < 18;
      const half = Math.max(1, Math.floor(count / 2));
      const offset = Math.floor(Math.random() * half);
      return day ? offset : Math.min(count - 1, half + offset);
    }
  }
  return (currentIndex + 1) % count;
}

function isInDndWindow(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return false;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return isInDnd(nowMins, s, e);
}

/**
 * Sync the JS shuffle store to WHAT THE NATIVE SERVICE ACTUALLY APPLIED.
 *
 * The native foreground service (Android) is the single source of truth
 * for rotation while the app is closed. It writes the last-applied index +
 * timestamp + uri to SharedPreferences; this reads them back and updates
 * `currentIndex` / `lastChangedAt` / `history` so the in-app "current
 * image" + countdown match the real wallpaper. It does NOT apply a
 * wallpaper — the native service already did. This is the fix for the
 * "app shows a different image than the actual wallpaper" report.
 *
 * Returns true if the store was advanced. No-op (false) on iOS, when the
 * native module isn't linked, or when JS is already in sync.
 */
export async function syncFromNativeShuffle(): Promise<boolean> {
  if (!isShuffleForegroundAvailable) return false;
  const last = getLastAppliedShuffle();
  if (!last || last.at <= 0) return false;

  await hydrateShuffleStore();
  const state = useShuffleStore.getState();
  const activeId = state.activeCollectionId;
  if (!activeId) return false;
  const collection = state.collections.find((c) => c.id === activeId);
  if (!collection || collection.photoIds.length === 0) return false;

  // Already caught up — native hasn't rotated since our last known change.
  if (state.lastChangedAt != null && last.at <= state.lastChangedAt) return false;

  // The native index is into the (precache-filtered) URI list. In the
  // common case nothing was dropped so it lines up with photoIds; clamp
  // defensively. The applied uri is the authoritative image either way —
  // we use it as the history thumbnail when the id doesn't resolve.
  const idx = Math.min(
    Math.max(last.index, 0),
    collection.photoIds.length - 1,
  );
  const photoId = collection.photoIds[idx];
  const photo = photoId ? getPhotoById(photoId) : null;

  useShuffleStore.getState().recordChange(
    {
      photoId: photo?.id ?? photoId ?? 'native',
      image: photo?.image ?? last.uri,
      at: last.at,
      collectionId: activeId,
    },
    idx,
  );
  return true;
}

export async function runShuffleBackgroundOnce(): Promise<boolean> {
  // Cold-launched bg dispatch may invoke this before any React tree
  // mounts. Idempotent — costs nothing on the warm path.
  await hydrateShuffleStore();

  // On Android the native foreground service owns rotation (it ticks
  // through Doze via AlarmManager). If it's running, DON'T apply here —
  // two appliers with independent indices fight and produce the
  // "wrong image" bug. Just mirror native's state into JS and bail.
  if (isShuffleForegroundAvailable && isShuffleForegroundRunning()) {
    await syncFromNativeShuffle();
    return false;
  }

  const state = useShuffleStore.getState();
  const activeId = state.activeCollectionId;
  if (!activeId) return false;
  const collection: Collection | undefined = state.collections.find(
    (c) => c.id === activeId,
  );
  if (!collection) return false;
  if (collection.photoIds.length === 0) return false;
  if (state.paused) return false;
  if (isInDndWindow(state.dndStart, state.dndEnd)) return false;

  if (state.lastChangedAt == null) {
    // First-ever bg tick after activation: stamp now and wait a full
    // interval. Mirrors the foreground host's behaviour.
    useShuffleStore.setState({ lastChangedAt: Date.now() });
    return false;
  }
  // Day-based is due at the next midnight; other modes at lastChanged +
  // interval. getNextChangeAt centralizes that rule.
  if (Date.now() < getNextChangeAt(collection, state.lastChangedAt)) return false;

  // Pick + apply next photo. Goes through the same recordChange path as
  // foreground ticks so currentIndex + history + lastChangedAt all stay
  // consistent.
  const nextIndex = pickNextShuffleIndex(
    collection.mode,
    state.currentIndex,
    collection.photoIds.length,
  );
  const r = await applyCollectionPhoto(
    collection.id,
    collection.photoIds,
    nextIndex,
  );
  return r.ok;
}

// ─── Foreground service control ──────────────────────────────────────────
//
// Solves the "OEM background killer eats the WorkManager job" problem on
// Vivo / MIUI / ColorOS. The native foreground service in
// `modules/shuffle-foreground/` keeps a 1-min-min Handler.postDelayed
// loop alive with a low-priority ongoing notification, which OEMs respect
// (their killers explicitly exempt foreground services with an active
// notification).
//
// JS contract:
//   1. When a shuffle is activated → pre-cache all 10 photoIds (download
//      remote URLs into cacheDirectory, gallery / internet URIs are
//      already local and pass through), then call `startShuffleForeground`
//      with the resolved file:// URI list.
//   2. When the shuffle is deactivated → call `stopShuffleForeground`.
//   3. The native service is the SOURCE OF TRUTH for rotation while the
//      app is closed. The JS foreground ticker still runs while active
//      (the service ticker also runs simultaneously — they both call
//      WallpaperManager.setBitmap which is idempotent at the OS level).
//
// On platforms without the native module (iOS / pre-rebuild dev session)
// `startShuffleForeground` returns false and JS falls back to the
// existing bg-fetch + AppState resume path.

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
