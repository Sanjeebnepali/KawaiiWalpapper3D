import { MOODS, type MoodId } from '../constants/moods';

/**
 * Deterministic hash-bucketing of a photo id → one of the 7 moods.
 *
 * Each photo in a Collection gets a stable mood assignment derived from
 * its id, so the user never has to manually tag anything. The mapping is:
 *
 *   djb2(photoId) % MOODS.length → MoodId
 *
 * Properties:
 *   1. Stable — same id always maps to the same mood across sessions / devices.
 *   2. Uniform — for a Collection of 10+ photos, expect ~1.4 photos per mood
 *      on average (so every mood always has at least one candidate in any
 *      reasonably-sized Collection).
 *   3. Cheap — pure JS, no native dep, no async.
 */

export function getMoodBucket(photoId: string): MoodId {
  let h = 5381;
  for (let i = 0; i < photoId.length; i++) {
    h = ((h << 5) + h + photoId.charCodeAt(i)) >>> 0;
  }
  return MOODS[h % MOODS.length].id;
}

/**
 * All photos in `photoIds` whose hash bucket matches `mood`. Order preserved.
 */
export function photosForMood(photoIds: string[], mood: MoodId): string[] {
  return photoIds.filter((id) => getMoodBucket(id) === mood);
}

/**
 * Pick one photo id from the Collection that buckets to `mood`. Strategy:
 *   1. Prefer a photo whose hash matches the mood (the "true" bucket).
 *   2. If the bucket is empty for that mood, fall back to a random photo
 *      from the whole Collection — better to switch wallpaper than freeze.
 *   3. Avoid `excludeId` (the photo currently applied) so the user actually
 *      sees a change.
 */
export function pickPhotoForMood(
  photoIds: string[],
  mood: MoodId,
  excludeId?: string | null,
): string | null {
  if (photoIds.length === 0) return null;

  const bucket = photosForMood(photoIds, mood).filter((id) => id !== excludeId);
  if (bucket.length > 0) {
    return bucket[Math.floor(Math.random() * bucket.length)];
  }

  // Fallback — bucket empty (small Collection where some moods are unfilled).
  const pool = photoIds.filter((id) => id !== excludeId);
  if (pool.length === 0) return photoIds[0] ?? null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Tally — how many photos from `photoIds` bucket into each mood. Used by the
 * Mood Home to show "Happy: 3 photos · Sad: 1 photo …" under the Collection,
 * so the user knows whether their Collection is "balanced" for mood mode.
 */
export function tallyMoodBuckets(photoIds: string[]): Record<MoodId, number> {
  const counts: Record<MoodId, number> = {
    happy: 0, sad: 0, angry: 0, calm: 0, excited: 0, surprised: 0, neutral: 0,
  };
  photoIds.forEach((id) => {
    counts[getMoodBucket(id)]++;
  });
  return counts;
}
