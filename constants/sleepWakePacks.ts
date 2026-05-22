/**
 * Curated Sleep/Wake wallpaper pairs.
 *
 * Each pack contains EXACTLY two images: a sunny/energetic morning version
 * and a calm/cosy night version of the same theme. The Sleep/Wake feature
 * on Mood Home picks one of these packs + two times (wake hour + sleep hour)
 * and auto-applies the matching image at each transition.
 *
 * Adding a new pack:
 *   1. Add a new entry below with a stable `id` (never re-used).
 *   2. Pick two `picsum.photos` seeds that produce visually distinct
 *      morning + night vibes — bright/colourful for `wakeImage`,
 *      dark/cosy for `sleepImage`.
 *   3. Pick an accent colour from `Colors` (or a hex) for the card border.
 *   4. Export — the pack picker auto-renders new entries.
 */

import { Colors } from './theme';

const pic = (seed: string, w = 720, h = 1280) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

export type SleepWakePack = {
  id: string;
  name: string;
  /** Short tag rendered on the picker card. */
  tagline: string;
  /** Card border + accent dot colour. */
  accentColor: string;
  /** Wallpaper URI shown at wake time. Bright, energetic. */
  wakeImage: string;
  /** Wallpaper URI shown at sleep time. Calm, dark, cosy. */
  sleepImage: string;
  /** Stable display IDs for these two photos so they flow through the
   *  existing `getPhotoById` resolver + history pipeline. */
  wakeId: string;
  sleepId: string;
};

export const SLEEP_WAKE_PACKS: SleepWakePack[] = [
  {
    id: 'kawaii-baby',
    name: 'Kawaii Baby',
    tagline: 'Cute baby · sunrise & cosy',
    accentColor: Colors.pink ?? '#fab3ca',
    wakeImage: pic('kawaii-baby-morning-sun'),
    sleepImage: pic('kawaii-baby-night-cosy'),
    wakeId: 'sw-kawaii-baby-wake',
    sleepId: 'sw-kawaii-baby-sleep',
  },
  {
    id: 'pastel-soft',
    name: 'Pastel Soft',
    tagline: 'Pastel sunshine · pastel moonlight',
    accentColor: '#C9A7FF',
    wakeImage: pic('pastel-morning-sunrise-soft'),
    sleepImage: pic('pastel-night-moonlight-dreamy'),
    wakeId: 'sw-pastel-soft-wake',
    sleepId: 'sw-pastel-soft-sleep',
  },
  {
    id: 'bunny-friends',
    name: 'Bunny Friends',
    tagline: 'Hopping bunny · sleeping bunny',
    accentColor: '#FFD27A',
    wakeImage: pic('bunny-morning-sunlight-grass'),
    sleepImage: pic('bunny-night-curl-up-blanket'),
    wakeId: 'sw-bunny-wake',
    sleepId: 'sw-bunny-sleep',
  },
  {
    id: 'cosmos',
    name: 'Cosmos',
    tagline: 'Sunrise space · starry night',
    accentColor: '#7DA6FF',
    wakeImage: pic('cosmos-morning-sunrise-galaxy'),
    sleepImage: pic('cosmos-night-stars-nebula'),
    wakeId: 'sw-cosmos-wake',
    sleepId: 'sw-cosmos-sleep',
  },
  {
    id: 'anime-soft',
    name: 'Anime Soft',
    tagline: 'Bright anime · sleepy anime',
    accentColor: '#FF4DD2',
    wakeImage: pic('anime-baby-morning-bright-colorful'),
    sleepImage: pic('anime-baby-night-yawn-blanket'),
    wakeId: 'sw-anime-wake',
    sleepId: 'sw-anime-sleep',
  },
  {
    id: 'nature-calm',
    name: 'Nature Calm',
    tagline: 'Sunny field · moonlit forest',
    accentColor: '#73F0C8',
    wakeImage: pic('nature-morning-meadow-sunbeam'),
    sleepImage: pic('nature-night-forest-moonlight'),
    wakeId: 'sw-nature-wake',
    sleepId: 'sw-nature-sleep',
  },
];

/** Sentinel pack id for the user-picked custom pair (two arbitrary photos
 *  from the catalog). The actual image IDs live in `useMoodStore` —
 *  `sleepWakeCustomWakeId` and `sleepWakeCustomSleepId`. */
export const CUSTOM_SLEEP_WAKE_ID = 'custom' as const;

/** Returns the pack matching `id`, or null. The sentinel CUSTOM_SLEEP_WAKE_ID
 *  is intentionally NOT returned by this — callers that care about custom
 *  pairs should check the id against `CUSTOM_SLEEP_WAKE_ID` and read the
 *  user-picked IDs out of the store directly. */
export function getSleepWakePack(id: string | null | undefined): SleepWakePack | null {
  if (!id) return null;
  if (id === CUSTOM_SLEEP_WAKE_ID) return null;
  return SLEEP_WAKE_PACKS.find((p) => p.id === id) ?? null;
}

/** Resolve a curated wakeId/sleepId back to a `{ id, image, title }`
 *  shape so the Mood Home "Currently applied" card can render the thumb
 *  for a Sleep/Wake image without hitting `getPhotoById` (those IDs
 *  aren't in mockData).
 *
 *  For CUSTOM pair IDs (those are normal catalog IDs), the caller should
 *  fall through to `getPhotoById` — those photos ARE in mockData. */
export function getSleepWakePhoto(photoId: string | null | undefined): {
  id: string;
  image: string;
  title: string;
} | null {
  if (!photoId) return null;
  for (const p of SLEEP_WAKE_PACKS) {
    if (p.wakeId === photoId) {
      return { id: p.wakeId, image: p.wakeImage, title: `${p.name} — Morning` };
    }
    if (p.sleepId === photoId) {
      return { id: p.sleepId, image: p.sleepImage, title: `${p.name} — Night` };
    }
  }
  return null;
}
