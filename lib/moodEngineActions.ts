import { type MoodId } from '../constants/moods';
import { getPhotoById, getThemePackPhotos, moodAlbums } from '../constants/mockData';
import {
  CUSTOM_SLEEP_WAKE_ID,
  getSleepWakePack,
} from '../constants/sleepWakePacks';
import { useMoodStore } from '../store/mood';
import { useShuffleStore } from '../store/shuffle';
import { pickPhotoForMood } from './moodBucket';
import { applyCollectionPhoto } from './shuffleActions';
import { setAsWallpaper } from './wallpaperActions';

/**
 * Bridge between the mood detector and the existing wallpaper-set pipeline.
 *
 * Given a detected mood + the active Mood Collection id, this:
 *   1. Looks up the Collection from `useShuffleStore`.
 *   2. Picks a photo from the Collection whose hash bucket matches the mood
 *      (falling back to any photo if the bucket is empty).
 *   3. Calls `applyCollectionPhoto(...)` — which sets the wallpaper AND
 *      writes to shuffle history — so mood-driven changes flow through the
 *      same plumbing as timer-driven changes.
 *
 * Returns `{ ok, message, photoId }` so the caller can toast and update its
 * own "currently applied" state.
 */
export async function applyMoodPhotoFromCollection(
  mood: MoodId,
  collectionId: string,
  currentPhotoId?: string | null,
): Promise<{ ok: boolean; message: string; photoId: string | null }> {
  const collection = useShuffleStore
    .getState()
    .collections.find((c) => c.id === collectionId);
  if (!collection) {
    return { ok: false, message: 'Collection not found', photoId: null };
  }
  if (collection.photoIds.length === 0) {
    return { ok: false, message: 'Collection is empty', photoId: null };
  }

  const nextPhotoId = pickPhotoForMood(
    collection.photoIds,
    mood,
    currentPhotoId,
  );
  if (!nextPhotoId) {
    return { ok: false, message: 'No matching photo', photoId: null };
  }
  const nextIndex = collection.photoIds.indexOf(nextPhotoId);

  const r = await applyCollectionPhoto(
    collection.id,
    collection.photoIds,
    nextIndex,
  );
  return { ...r, photoId: nextPhotoId };
}

/**
 * Resolve a usable mood-pool Collection id, MATERIALIZING a default built-in
 * mood album if the user never set one (or set one that's since gone empty).
 *
 * Why: a mood-prompt notification tap ("Happy"/"Calm"/…) used to silently do
 * nothing when `moodCollectionId` was null — the most common reason a user
 * reported "I tap the mood and nothing happens." Friend check-in / daily
 * prompts can be enabled without ever building a pool, so the tap had no
 * photos to choose from. Falling back to a default album makes the tap always
 * apply a mood-matching wallpaper, and persists the choice so it's stable.
 *
 * Returns null only if there are genuinely no mood albums to fall back to.
 */
export async function ensureMoodCollectionId(): Promise<string | null> {
  const { moodCollectionId } = useMoodStore.getState();
  const existing = moodCollectionId
    ? useShuffleStore.getState().collections.find((c) => c.id === moodCollectionId)
    : null;
  if (existing && existing.photoIds.length > 0) return moodCollectionId;

  const album = Array.isArray(moodAlbums) ? moodAlbums[0] : null;
  if (!album) return moodCollectionId ?? null;
  const photoIds = (getThemePackPhotos(album.id, 10) ?? []).map((p) => p.id);
  if (photoIds.length === 0) return moodCollectionId ?? null;

  const cid = useShuffleStore
    .getState()
    .ensureBuiltinPackCollection(album.id, album.title, photoIds);
  await useMoodStore.getState().setMoodCollection(cid);
  return cid;
}

/**
 * Apply the wake or sleep image from a curated Sleep/Wake pack.
 *
 * Used by:
 *   - Notification action handler when user taps "Apply" on the wake/sleep
 *     notification
 *   - Background-task fallback when the user ignored the notification but
 *     we're past the wake/sleep time and haven't applied today
 *
 * Routes through the existing `setAsWallpaper` pipeline (downloads remote
 * URL to cache, sets via WallpaperManager.setBitmap on Android). Returns
 * the same `{ ok, message, photoId }` contract as `applyMoodPhotoFromCollection`.
 */
export async function applySleepWakePhoto(
  packId: string,
  kind: 'wake' | 'sleep',
): Promise<{ ok: boolean; message: string; photoId: string | null }> {
  // CUSTOM PAIR — the stored id is either a catalog ID (e.g.
  // 'mood-happy-3') OR a direct URI from the user's gallery
  // ('file://...' / 'content://...'). For URIs we use them as the
  // image source directly; for catalog IDs we resolve via getPhotoById.
  if (packId === CUSTOM_SLEEP_WAKE_ID) {
    const s = useMoodStore.getState();
    const id = kind === 'wake' ? s.sleepWakeCustomWakeId : s.sleepWakeCustomSleepId;
    if (!id) {
      return {
        ok: false,
        message: `Custom ${kind} image not picked yet`,
        photoId: null,
      };
    }
    const isDirectUri = id.startsWith('file://') || id.startsWith('content://');
    const image = isDirectUri ? id : getPhotoById(id)?.image;
    if (!image) {
      return { ok: false, message: 'Custom photo not found', photoId: null };
    }
    const r = await setAsWallpaper(image, id, 'both');
    return { ...r, photoId: id };
  }

  const pack = getSleepWakePack(packId);
  if (!pack) {
    return { ok: false, message: 'Sleep/Wake pack not found', photoId: null };
  }
  const image = kind === 'wake' ? pack.wakeImage : pack.sleepImage;
  const photoId = kind === 'wake' ? pack.wakeId : pack.sleepId;
  const r = await setAsWallpaper(image, photoId, 'both');
  return { ...r, photoId };
}
