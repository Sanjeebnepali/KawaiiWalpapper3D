import { pic } from './mockData.tokens';
import { type CategoryPhoto } from './mockData.types';
import { catalogById, categorySections, moodSections } from './wallpaperCatalog';

// --- Top-tab screen data ---

export type VideoWallpaper = {
  id: string;
  thumb: string;
  title: string;
  duration: string;
};
export const videoWallpapers: VideoWallpaper[] = Array.from({ length: 8 }, (_, i) => ({
  id: `video-${i}`,
  thumb: pic(`video-${i}`),
  title: ['Floating Hearts', 'Rain Window', 'Neon Drift', 'Sparkle Bloom', 'Cloud Dream', 'Aurora Baby', 'Petal Fall', 'Galaxy Crib'][i],
  duration: ['0:08', '0:12', '0:06', '0:10', '0:15', '0:09', '0:07', '0:11'][i],
}));

export type DualPair = {
  id: string;
  lockImage: string;
  homeImage: string;
  title: string;
};
export const dualWallpapers: DualPair[] = Array.from({ length: 6 }, (_, i) => ({
  id: `dual-${i}`,
  lockImage: pic(`dual-lock-${i}`),
  homeImage: pic(`dual-home-${i}`),
  title: ['Soft Morning', 'Midnight Pair', 'Pastel Set', 'Cherry Duo', 'Frost & Glow', 'Coquette Match'][i],
}));

export type ThemePack = {
  id: string;
  title: string;
  count: number;
  thumbs: string[]; // exactly 4, for the 2x2 preview
  photoIds: string[]; // the 10 real catalog photos in this album
};

// Default albums, each EXACTLY 10 real images. Theme-pack albums draw ONLY
// from the themed CATEGORY sections (football, cooking, stylish, …) and
// Mood-based albums draw ONLY from the MOOD/emotion sections (happy, love,
// crying, …). Because the two pools come from different catalog groups they
// are disjoint by construction AND semantically correct — Theme Packs never
// show mood images and vice-versa.
//
// Previously both pools were an even/odd split of the WHOLE catalog
// (categories + moods + 2D mixed together), which leaked mood images into the
// Theme Packs — owner: "theme based must not include the mood based images."
const POOL_THEME: CategoryPhoto[] = categorySections.flatMap((s) => s.photos);
const POOL_MOOD: CategoryPhoto[] = moodSections.flatMap((s) => s.photos);

function mixedAlbum(pool: CategoryPhoto[], k: number): CategoryPhoto[] {
  const total = pool.length || 1;
  // Stride of 17 spans the pool; per-album offset keeps the 5 albums distinct.
  return Array.from({ length: 10 }, (_, j) => pool[(j * 17 + k * 11) % total]).filter(Boolean);
}
function buildAlbums(pool: CategoryPhoto[], titles: string[], idPrefix: string): ThemePack[] {
  return titles.map((title, k) => {
    const photos = mixedAlbum(pool, k);
    return {
      id: `${idPrefix}-${k + 1}`,
      title,
      count: photos.length,
      thumbs: photos.slice(0, 4).map((p) => p.image),
      photoIds: photos.map((p) => p.id),
    };
  });
}

const THEME_TITLES = ['Daily Mix', 'Cute Picks', 'Soft & Dreamy', 'Bold & Bright', 'Editor’s Set'];
const MOOD_ALBUM_TITLES = ['Mood Mix', 'Feelings', 'Good Vibes', 'Heart & Soul', 'Inner World'];

/** Theme Packs tab albums (POOL_THEME). */
export const themePacks: ThemePack[] = buildAlbums(POOL_THEME, THEME_TITLES, 'album');
/** Mood-based pool albums — completely separate images from themePacks. */
export const moodAlbums: ThemePack[] = buildAlbums(POOL_MOOD, MOOD_ALBUM_TITLES, 'mood-album');

// Resolves photos for ANY album id (theme-pack OR mood) so callers don't care
// which list it came from.
export function getThemePackPhotos(packId: string, count = 18): CategoryPhoto[] {
  const pack =
    themePacks.find((p) => p.id === packId) ?? moodAlbums.find((p) => p.id === packId);
  if (!pack) return [];
  return pack.photoIds
    .map((id) => catalogById[id])
    .filter((p): p is CategoryPhoto => !!p)
    .slice(0, count);
}

export const getThemePackById = (id: string): ThemePack | undefined =>
  themePacks.find((p) => p.id === id);
