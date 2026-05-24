import {
  type Collection,
  isInDnd,
  parseHHMM,
  type ShuffleMode,
} from '../constants/shuffle';
import { getPhotoById } from '../constants/mockData';
import { setAsWallpaper } from '../lib/wallpaperActions';
import { useShuffleStore } from '../store/shuffle';

type ApplyResult =
  | { ok: true; photoId: string; image: string }
  | { ok: false; message: string };

function resolvePhoto(photoId: string): { id: string; image: string } | null {
  const photo = getPhotoById(photoId);
  return photo ? { id: photo.id, image: photo.image } : null;
}

function pickNextIndex(
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
      // Avoid immediate repeat.
      if (n === currentIndex) n = (n + 1) % count;
      return n;
    }
    case 'day': {
      // Advance one image per day. The DAY boundary (midnight) is what
      // triggers this tick — see getNextChangeAt — so stepping by one each
      // time cycles through the WHOLE collection, one new image per day,
      // instead of the old weekday-modulo that only ever used the first 7
      // images and re-applied the same one all day.
      return (currentIndex + 1) % count;
    }
    case 'smart': {
      // Bright (first half of array) by day, dark (second half) by night.
      const hour = new Date().getHours();
      const day = hour >= 6 && hour < 18;
      const half = Math.max(1, Math.floor(count / 2));
      const offset = Math.floor(Math.random() * half);
      return day ? offset : Math.min(count - 1, half + offset);
    }
  }
  // Defensive fallback — older persisted state may carry a deleted mode id
  // (e.g. the removed 'mood'). Treat as sequential.
  return (currentIndex + 1) % count;
}

async function applyNextRaw(collection: Collection): Promise<ApplyResult> {
  const photoIds = collection.photoIds;
  if (photoIds.length === 0) {
    return { ok: false, message: 'Collection is empty' };
  }
  const state = useShuffleStore.getState();
  const nextIndex = pickNextIndex(
    collection.mode,
    state.currentIndex,
    photoIds.length,
  );
  const photo = resolvePhoto(photoIds[nextIndex]);
  if (!photo) return { ok: false, message: 'Photo not found' };

  const r = await setAsWallpaper(photo.image, photo.id, 'both');
  if (!r.ok) return { ok: false, message: r.message };

  state.recordChange(
    {
      photoId: photo.id,
      image: photo.image,
      at: Date.now(),
      collectionId: collection.id,
    },
    nextIndex,
  );
  return { ok: true, photoId: photo.id, image: photo.image };
}

// Module-level mutex shared between the root host's tick and the Skip
// button on the Active screen — both call applyNext; we never want overlap.
let applyInFlight = false;
export async function applyNext(collection: Collection): Promise<ApplyResult> {
  if (applyInFlight) return { ok: false, message: 'Already applying' };
  applyInFlight = true;
  try {
    return await applyNextRaw(collection);
  } finally {
    applyInFlight = false;
  }
}

function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function isInDndWindow(start: string | null, end: string | null): boolean {
  if (!start || !end) return false;
  const s = parseHHMM(start);
  const e = parseHHMM(end);
  if (s == null || e == null) return false;
  return isInDnd(nowMinutes(), s, e);
}
