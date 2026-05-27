/**
 * Resolver bridge between the mood store and the native context-mood
 * foreground service (`modules/context-mood-foreground/`).
 *
 * WHY THIS EXISTS (the "footstep / auto-detect only changes when I open the
 * app" bug): the context-mood service used to do NO work itself — each alarm
 * tick just called `Module.instance?.emitTick()` to bounce the work back to
 * JS (`runMoodBackgroundOnce`). When the app process is dead (the normal state
 * once the app's been closed a while, and the default on Vivo/MIUI/ColorOS),
 * `instance` is null, so the tick applied nothing. The wallpaper only changed
 * while the JS runtime was alive.
 *
 * The fix mirrors the proven Sleep/Wake + Shuffle pattern: JS pre-resolves the
 * active Mood Collection into a `mood → local file:// URIs` map (downloaded to
 * the PERSISTENT document dir so the file survives until the tick fires), and
 * the native service picks + applies a photo for the current time-of-day mood
 * itself — no live JS needed. JS still records history when it happens to be
 * alive at tick time (see `recordBackgroundMoodTick`), but the apply no longer
 * depends on it.
 */

import { getPhotoById } from '../constants/mockData';
import { MOODS, type MoodId } from '../constants/moods';
import { photosForMood } from './moodBucket';
import { useMoodStore } from '../store/mood';
import { useShuffleStore } from '../store/shuffle';
import {
  isContextMoodForegroundAvailable,
  startContextMoodForeground,
  stopContextMoodForeground,
} from '../modules/context-mood-foreground';
import { downloadToPersistent } from './wallpaperActions';

export { isContextMoodForegroundAvailable, stopContextMoodForeground };

/** The payload handed to the native service. `moodUris[mood]` holds the local
 *  file paths bucketed to that mood; `all` is the flat union the service falls
 *  back to when a mood's own bucket is empty. */
type ContextMoodPayload = {
  moodUris: Partial<Record<MoodId, string[]>>;
  all: string[];
};

/** Resolve one collection photo id to a local persistent `file://` path, or
 *  null if it can't be fetched. Catalog ids resolve via getPhotoById; gallery
 *  / internet URIs are passed straight through downloadToPersistent. */
async function resolveToLocalUri(photoId: string): Promise<string | null> {
  try {
    if (photoId.startsWith('file://') || photoId.startsWith('content://')) {
      return await downloadToPersistent(photoId, photoId);
    }
    const photo = getPhotoById(photoId);
    if (!photo) return null;
    return await downloadToPersistent(photo.image, photo.id);
  } catch {
    return null;
  }
}

/** Build the mood→uris payload from the active Mood Collection. Returns null
 *  when there's nothing usable to apply (no collection, empty, all downloads
 *  failed). */
async function buildPayload(): Promise<ContextMoodPayload | null> {
  const m = useMoodStore.getState();
  if (!m.moodCollectionId) return null;
  const collection = useShuffleStore
    .getState()
    .collections.find((c) => c.id === m.moodCollectionId);
  if (!collection || collection.photoIds.length === 0) return null;

  const moodUris: Partial<Record<MoodId, string[]>> = {};
  const all: string[] = [];
  // Each photo id buckets to exactly one mood (getMoodBucket), so iterating the
  // 7 moods visits every id once — no cross-mood duplication.
  for (const mood of MOODS) {
    const ids = photosForMood(collection.photoIds, mood.id);
    if (ids.length === 0) continue;
    const resolved = (await Promise.all(ids.map(resolveToLocalUri))).filter(
      (u): u is string => typeof u === 'string',
    );
    if (resolved.length > 0) {
      moodUris[mood.id] = resolved;
      all.push(...resolved);
    }
  }
  if (all.length === 0) return null;
  return { moodUris, all };
}

/**
 * Resolve the active Mood Collection and (re)start the native context-mood
 * foreground service with a fresh payload. Call on enable, on app bootstrap,
 * and whenever the active Mood Collection changes. No-op on iOS / pre-rebuild
 * builds where the native module isn't linked, or when the gates are off.
 *
 * Fire-and-forget from callers — failures are silent (the JS bg-fetch fallback
 * still covers iOS + the FGS-killed case).
 */
export async function startContextMoodForegroundFromStore(
  intervalMinutes: number,
): Promise<boolean> {
  if (!isContextMoodForegroundAvailable) return false;
  if (!useMoodStore.getState().backgroundEnabled) return false;
  const payload = await buildPayload();
  if (!payload) return false;
  return startContextMoodForeground({
    intervalMinutes,
    payloadJson: JSON.stringify(payload),
  });
}
