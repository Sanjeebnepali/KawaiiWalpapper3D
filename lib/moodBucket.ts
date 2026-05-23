import { CATALOG_TO_MOOD, MOODS, type MoodId } from '../constants/moods';

/**
 * Maps a photo id → one of the 7 moods, SEMANTICALLY when the id encodes a
 * known emotion, otherwise by a stable hash.
 *
 * Catalog photo ids encode their emotion folder as `mood-<catalogKey>-<n>`
 * (e.g. `mood-happy-1`, `mood-crying-3`). For those we look the catalogKey up
 * in CATALOG_TO_MOOD (the inverse of MOOD_TO_CATALOG) and return the matching
 * picker MoodId — so the Happy mood actually applies Happy images. This is the
 * fix for the old behaviour, which hashed the id STRING and so bucketed
 * `mood-happy-1` to whatever `djb2('mood-happy-1') % 7` happened to land on.
 *
 * For ids with NO semantic emotion — arbitrary theme-pack / category photos
 * (`category-football-2`, `2d-mixed-1`, `pink-lolita-0`), gallery URIs
 * (`file://` / `content://`) or http(s) downloads — we fall back to the
 * original djb2 hash so the assignment is still deterministic and evenly
 * spread (same id → same mood across sessions / devices, no native dep).
 */

/** djb2 string hash → stable [0, MOODS.length) bucket index. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h % MOODS.length;
}

/**
 * Extract the catalog emotion key from a mood photo id.
 * `mood-<catalogKey>-<n>` → `<catalogKey>` (e.g. `mood-happy-1` → `happy`,
 * `mood-heartbroken-12` → `heartbroken`). Returns null for any other shape.
 */
function moodCatalogKey(photoId: string): string | null {
  const m = /^mood-([a-z]+)-\d+$/.exec(photoId);
  return m ? m[1] : null;
}

export function getMoodBucket(photoId: string): MoodId {
  // 1. Semantic: the id encodes a real emotion folder → use it directly.
  const key = moodCatalogKey(photoId);
  if (key) {
    const semantic = CATALOG_TO_MOOD[key];
    if (semantic) return semantic;
  }
  // 2. Fallback: no emotion in the id (theme-pack / category / 2D photo,
  //    gallery URI, http download) → stable hash so distribution stays even.
  return MOODS[djb2(photoId)].id;
}

/**
 * All photos in `photoIds` whose mood bucket (semantic when the id encodes an
 * emotion, hashed otherwise — see getMoodBucket) matches `mood`. Order preserved.
 */
export function photosForMood(photoIds: string[], mood: MoodId): string[] {
  return photoIds.filter((id) => getMoodBucket(id) === mood);
}

/**
 * Nearest-neighbour moods for the empty-bucket fallback (C2). When a
 * Collection has no photo for the requested mood, prefer a photo from a
 * SEMANTICALLY adjacent mood that IS present (e.g. show an excited photo for
 * happy) before resorting to a fully random pick. Neighbours are ordered best
 * → acceptable; the picker walks the list and uses the first present one.
 */
const MOOD_NEIGHBORS: Record<MoodId, MoodId[]> = {
  happy: ['excited', 'calm', 'neutral'],
  excited: ['happy', 'surprised', 'calm'],
  calm: ['neutral', 'happy', 'sad'],
  neutral: ['calm', 'happy', 'surprised'],
  sad: ['angry', 'neutral', 'calm'],
  angry: ['sad', 'surprised', 'neutral'],
  surprised: ['excited', 'happy', 'neutral'],
};

/**
 * Pick one photo id from the Collection that matches `mood`. Order (first hit
 * wins) — designed so the user always sees a CORRECT-or-near image, and pure
 * random is only the last resort:
 *   1. The mood's own bucket, excluding `excludeId` (the currently-applied
 *      photo) so the wallpaper actually changes.
 *   2. M6 — if the bucket was NON-empty before the exclude filter but became
 *      empty only because the single matching photo IS `excludeId`, re-apply
 *      that one correct photo. Re-showing the right image beats switching to a
 *      wrong one.
 *   3. C2 — if the bucket was genuinely empty for this mood, try each
 *      SEMANTIC neighbour mood (see MOOD_NEIGHBORS) and use the first that has
 *      a photo (still excluding `excludeId`).
 *   4. Absolute last resort — a random photo from the whole Collection.
 */
export function pickPhotoForMood(
  photoIds: string[],
  mood: MoodId,
  excludeId?: string | null,
): string | null {
  if (photoIds.length === 0) return null;

  // 1. The mood's own bucket (before excludeId), so we can tell M6 (single
  //    matching photo == current) apart from a genuinely empty bucket.
  const rawBucket = photosForMood(photoIds, mood);
  const bucket = rawBucket.filter((id) => id !== excludeId);
  if (bucket.length > 0) {
    return bucket[Math.floor(Math.random() * bucket.length)];
  }

  // 2. M6 — bucket had matches but they were all excluded (in practice the one
  //    correct photo is the current one). Re-apply the correct image rather
  //    than falling through to a wrong neighbour / random pick.
  if (rawBucket.length > 0) {
    return rawBucket[Math.floor(Math.random() * rawBucket.length)];
  }

  // 3. C2 — bucket genuinely empty for this mood. Borrow from the nearest
  //    semantic neighbour that has a photo before going random.
  for (const neighbor of MOOD_NEIGHBORS[mood]) {
    const nb = photosForMood(photoIds, neighbor).filter((id) => id !== excludeId);
    if (nb.length > 0) {
      return nb[Math.floor(Math.random() * nb.length)];
    }
  }

  // 4. Last resort — no semantic match anywhere (e.g. a theme-pack-only
  //    Collection whose ids carry no emotion). Pick any photo so the wallpaper
  //    still changes rather than freezing.
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
