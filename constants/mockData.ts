import { type CoupleImageSource, couplePacks } from './couplePacks';
import { Colors } from './theme';
import {
  catalogById,
  catalogSections,
  categorySections,
  moodSections,
  twoDSections,
  sectionByKey,
  type CatalogSection,
} from './wallpaperCatalog';

// Accent palette cycled across the real categories / moods / 2D sections so
// each card glows its own color (catalog data carries no color of its own).
const ACCENTS = [Colors.pink, Colors.cyan, Colors.lavender, Colors.gold];

// Default thumb size — the single biggest perf lever in this app.
// A 720×1280 picsum image decodes to ~3.7 MB of bitmap in RAM; multiply by
// 30 cells in a grid and we're paging ~110 MB just for thumbnails the user
// sees at ~180×180 px. The phone GC-pauses on every scroll. 480×854 decodes
// to ~1.6 MB, still looks crisp at the 80–360 px sizes grids actually
// display at, and keeps total grid memory under 50 MB.
//
// The wallpaper preview screen pays the bandwidth for a high-res variant via
// `picLarge()` since it's a single image at full screen.
const pic = (seed: string, w = 480, h = 854) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

/** High-res variant used by the full-screen wallpaper preview. */
export const picLarge = (seed: string) =>
  `https://picsum.photos/seed/${seed}/1080/1920`;

export type TopTab = { id: string; label: string };
// Couple Theme + Mood Based live in the BOTTOM tab bar (see CustomTabBar),
// not here — these top tabs are the wallpaper-format switchers only.
export const topTabs: TopTab[] = [
  { id: 'wallpapers', label: 'Wallpapers' },
  { id: '2d', label: '2D Kawaii' },
  // id stays 'dual' (route /wallpapers/dual) — only the display label changed.
  { id: 'dual', label: 'Premium Collection' },
  { id: 'theme-packs', label: 'Theme Packs' },
];

export type ThemeItem = {
  id: string;
  title: string;
  vibe: string;
  image: string;
  accent: string;
  badge?: string;
};
// "Theme Based" row on Home now showcases the 2D Kawaii sections. Tapping a
// card opens that 2D set via the generalized /category/2d-<key> browse route.
const THEME_VIBES: Record<string, string> = {
  mixed: 'Soft · Flat',
  excited: 'Vibrant · 2D',
  heartbroken: 'Moody · 2D',
  nervous: 'Jittery · 2D',
  confused: 'Swirly · 2D',
  angry: 'Bold · 2D',
};
export const themes: ThemeItem[] = twoDSections.map((s, i) => ({
  id: `2d-${s.key}`,
  title: s.label === '2D Kawaii' ? '2D Kawaii' : `${s.label} (2D)`,
  vibe: THEME_VIBES[s.key] ?? '2D Kawaii',
  image: s.photos[0]?.image ?? '',
  accent: ACCENTS[i % ACCENTS.length],
  badge: i === 0 ? 'NEW' : undefined,
}));

// CategoryId is now any catalog browse id (a bare category key like
// "football", or a composite "mood-love" / "2d-mixed"). Was a fixed union.
export type CategoryId = string;

export type CategoryPhoto = { id: string; image: string };

// Ionicons per themed category. Unmapped keys fall back to 'image'.
const CATEGORY_ICONS: Record<string, string> = {
  football: 'football',
  gym: 'barbell',
  yoga: 'body',
  studying: 'book',
  dance: 'musical-notes',
  cooking: 'restaurant',
  gardening: 'flower',
  photography: 'camera',
  painting: 'color-palette',
  bike: 'bicycle',
  sleeping: 'moon',
  'playing-game': 'game-controller',
  'watching-movie': 'film',
  stylish: 'shirt',
};

export type CategoryIcon = {
  id: string;
  label: string;
  icon: string; // Ionicons glyph name
  tint: string;
};
export const categoryIcons: CategoryIcon[] = categorySections.map((s, i) => ({
  id: s.key,
  label: s.label,
  icon: CATEGORY_ICONS[s.key] ?? 'image',
  tint: ACCENTS[i % ACCENTS.length],
}));

export const categoryMeta: Record<string, { title: string; accent: string }> =
  categorySections.reduce(
    (acc, s, i) => {
      acc[s.key] = { title: s.label, accent: ACCENTS[i % ACCENTS.length] };
      return acc;
    },
    {} as Record<string, { title: string; accent: string }>,
  );

// Curated "Best Picks" for the home hero — the strongest images. Painting +
// Stylish + Photography lead (owner's picks). gym/yoga are intentionally left
// out (they live in the category row). Edit BEST_PICKS to recurate.
const BEST_PICKS: { group: 'category' | 'mood' | '2d'; key: string; n: number }[] = [
  { group: 'category', key: 'painting', n: 3 },
  { group: 'category', key: 'stylish', n: 3 },
  { group: 'category', key: 'photography', n: 3 },
  { group: 'mood', key: 'love', n: 2 },
  { group: '2d', key: 'mixed', n: 2 },
  { group: 'category', key: 'dance', n: 2 },
  { group: 'category', key: 'cooking', n: 2 },
  { group: 'mood', key: 'happy', n: 1 },
];
export const bestPicks: CategoryPhoto[] = BEST_PICKS.flatMap(({ group, key, n }) =>
  (sectionByKey(group, key)?.photos ?? []).slice(0, n),
);

// The "Premium" button browses the curated best picks (all free for now).
const PREMIUM_SECTION: CatalogSection = {
  group: 'category',
  key: 'premium',
  label: 'Premium',
  tier: 'free',
  photos: bestPicks,
};

/**
 * Resolve a browse id to a catalog section. Accepts a composite
 * "<group>-<key>" (mood-love, 2d-mixed, category-football), a bare category
 * key (football), or "premium" (the curated best). Powers the generalized
 * /category/[id] screen so one screen browses categories, moods, AND 2D sets.
 */
export function resolveBrowse(id: string): CatalogSection | undefined {
  if (id === 'premium' || id === 'category-premium') return PREMIUM_SECTION;
  for (const g of ['category', 'mood', '2d'] as const) {
    if (id.startsWith(`${g}-`)) {
      const sec = sectionByKey(g, id.slice(g.length + 1));
      if (sec) return sec;
    }
  }
  return sectionByKey('category', id);
}

export function browseMeta(id: string): { title: string; accent: string } {
  const sec = resolveBrowse(id);
  if (!sec) return { title: 'Wallpapers', accent: Colors.pink };
  if (sec.key === 'premium') return { title: 'Premium', accent: Colors.gold };
  const idx = categorySections.findIndex((s) => s.key === sec.key);
  return { title: sec.label, accent: ACCENTS[(idx >= 0 ? idx : 0) % ACCENTS.length] };
}

export function getCategoryPhotos(id: string, count = 24): CategoryPhoto[] {
  return (resolveBrowse(id)?.photos ?? []).slice(0, count);
}

export type FeaturedItem = {
  id: string;
  title: string;
  tag: string;
  image: string;
  accent: string;
};
// Curated premium hero — the best-looking spread across groups, to make the
// home feel high-end. EDIT THIS LIST to change what headlines the home: each
// entry pulls the first image of that section. (Owner can hand-pick later.)
const FEATURED_PICKS: { group: 'category' | 'mood' | '2d'; key: string; tag: string }[] = [
  { group: 'category', key: 'stylish', tag: 'Premium' },
  { group: 'mood', key: 'love', tag: 'Trending' },
  { group: 'category', key: 'photography', tag: 'New Drop' },
  { group: '2d', key: 'mixed', tag: '2D Kawaii' },
  { group: 'category', key: 'dance', tag: 'Hot' },
  { group: 'mood', key: 'happy', tag: 'Live' },
];
export const featured: FeaturedItem[] = FEATURED_PICKS.flatMap((p, i) => {
  const sec = sectionByKey(p.group, p.key);
  const photo = sec?.photos[0];
  if (!sec || !photo) return [];
  return [{ id: photo.id, title: sec.label, tag: p.tag, image: photo.image, accent: ACCENTS[i % ACCENTS.length] }];
});

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  accent: string;
  count: number;
  badge?: string;
};
// "Popular Collections" grid now surfaces the MOOD/emotion sets (Happy, Love,
// Heartbroken, …) so that emotion content is browsable from Home. Tapping
// opens /category/mood-<key>.
const COLLECTION_SUBS: Record<string, string> = {
  happy: 'Bright & cute',
  excited: 'Vibrant energy',
  calm: 'Soft & peaceful',
  love: 'Hearts & warmth',
  heartbroken: 'Moody blue',
  nervous: 'Jittery cute',
  confused: 'Wide-eyed',
  angry: 'Grumpy bold',
  crying: 'Teary soft',
};
export const collections: Collection[] = moodSections.map((s, i) => ({
  id: `mood-${s.key}`,
  title: s.label,
  subtitle: COLLECTION_SUBS[s.key] ?? 'Mood wallpapers',
  image: s.photos[0]?.image ?? '',
  accent: ACCENTS[i % ACCENTS.length],
  count: s.photos.length,
  badge: i === 0 ? 'Trending' : undefined,
}));

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

export const getFeaturedById = (id: string): FeaturedItem | undefined =>
  featured.find((f) => f.id === id);

export function getPhotoById(id: string | null | undefined): FeaturedItem | undefined {
  // Null / empty / undefined guard. Several call sites pass
  // `collection.photoIds[0]` for bottom-strip thumbs etc., which is
  // undefined when a pool has zero photos (newly created custom pool,
  // the most reliable repro). Without this guard the next line
  // (`id.startsWith(...)`) throws `TypeError: Cannot read property
  // 'startsWith' of undefined` and crashes MoodHome's render. Found via
  // logcat trace: changes/063 conversation, PID 22903 FATAL EXCEPTION
  // mqt_v_native.
  if (typeof id !== 'string' || id.length === 0) return undefined;

  // URI-style ids — gallery picks (file:// / content://) and internet
  // downloads that were cached as file URIs (kawaii-<hash>.jpg in the
  // app's cacheDirectory) are stored on collections AS their URI. They
  // resolve directly: id IS the image source, no catalog lookup needed.
  // This makes user-built collection photos flow through the engine
  // (applyCollectionPhoto → setAsWallpaper) without special-casing.
  if (
    id.startsWith('file://') ||
    id.startsWith('content://') ||
    id.startsWith('http://') ||
    id.startsWith('https://')
  ) {
    return { id, title: 'My photo', tag: 'Custom', image: id, accent: Colors.pink };
  }
  // Real catalog photo id (e.g. "category-football-2", "mood-love-3",
  // "2d-mixed-1") → resolve to its Supabase image URL.
  const cat = catalogById[id];
  if (cat) {
    return { id: cat.id, title: 'Wallpaper', tag: 'Wallpaper', image: cat.image, accent: Colors.pink };
  }
  const f = featured.find((x) => x.id === id);
  if (f) return f;
  // No real asset backs this id (CORE-7). Previously a "slug-N" id matched a
  // generic regex and got a fabricated `pic(id)` (random picsum) URL — so a
  // stale favorite id from an older catalog rendered an unrelated stock image
  // in preview/apply instead of a missing-asset state. Return undefined and
  // let the caller render an "unavailable" state.
  return undefined;
}

// --- Couple Theme screen data ---

export type CoupleWallpaper = {
  /** The couple PACK id — tapping a card opens `/couple/preview?packId=…`. */
  id: string;
  image: CoupleImageSource;
  title: string;
  accent: string;
};
// The couple tab shows ONE card per real pack, and only its TOGETHER image
// (the complete two-character scene). The boy/girl solo halves are never
// shown in the grid — they're revealed on the preview screen after a tap,
// where each partner picks which half is theirs.
export const coupleWallpapers: CoupleWallpaper[] = couplePacks.map((p) => ({
  id: p.id,
  image: p.togetherImage,
  title: p.name,
  accent: p.accent,
}));

// --- Mood Based screen data ---

export type Mood = {
  id: string;
  label: string;
  icon: 'happy-outline' | 'leaf-outline' | 'heart-outline' | 'flash-outline' | 'cloud-outline' | 'cafe-outline';
  tint: string;
};
export const moods: Mood[] = [
  { id: 'happy', label: 'Happy', icon: 'happy-outline', tint: Colors.gold },
  { id: 'calm', label: 'Calm', icon: 'leaf-outline', tint: Colors.cyan },
  { id: 'romantic', label: 'Romantic', icon: 'heart-outline', tint: Colors.pink },
  { id: 'focused', label: 'Focused', icon: 'flash-outline', tint: Colors.lavender },
  { id: 'dreamy', label: 'Dreamy', icon: 'cloud-outline', tint: Colors.lavender },
  { id: 'cozy', label: 'Cozy', icon: 'cafe-outline', tint: Colors.gold },
];
export const getMoodById = (id: string): Mood | undefined =>
  moods.find((m) => m.id === id);

// sad/surprised/neutral have no own folder → nearest real content.
const MOOD_ALIAS: Record<string, string> = {
  sad: 'crying',
  surprised: 'confused',
  neutral: 'calm',
};
export function getMoodPhotos(moodId: string, count = 18): CategoryPhoto[] {
  const key = MOOD_ALIAS[moodId] ?? moodId;
  const sec = sectionByKey('mood', key);
  return (sec?.photos ?? moodSections[0]?.photos ?? []).slice(0, count);
}

// --- Unified search catalog (Task 6) ---

export type SearchableWallpaper = {
  id: string;
  title: string;
  category: string;
  tags: string[];
  image: string;
  accent: string;
};

const toTags = (...parts: string[]) =>
  Array.from(
    new Set(
      parts
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 1),
    ),
  );

// Built from the real catalog — every category / mood / 2D photo is
// searchable, and the same list backs the shuffle + mood-pool photo pickers.
export const searchCatalog: SearchableWallpaper[] = catalogSections.flatMap((s) =>
  s.photos.map((p, i) => ({
    id: p.id,
    title: `${s.label} ${i + 1}`,
    category: s.label,
    tags: toTags(s.label, s.group, 'wallpaper'),
    image: p.image,
    accent: Colors.pink,
  })),
);

/** Distinct category names, for the search screen's filter chips. */
export const searchCategories: string[] = Array.from(
  new Set(searchCatalog.map((w) => w.category)),
);

/**
 * Filters the catalog by a free-text query (matched against title + tags) and
 * an optional set of selected categories. Empty query + empty filters returns
 * the full catalog.
 */
export function searchWallpapers(
  query: string,
  categories: string[] = [],
): SearchableWallpaper[] {
  const q = query.trim().toLowerCase();
  return searchCatalog.filter((w) => {
    const matchesQuery =
      !q ||
      w.title.toLowerCase().includes(q) ||
      w.tags.some((t) => t.includes(q));
    const matchesCategory =
      categories.length === 0 || categories.includes(w.category);
    return matchesQuery && matchesCategory;
  });
}
