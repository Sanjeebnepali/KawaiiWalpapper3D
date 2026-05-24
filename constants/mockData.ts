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
import { ACCENTS, pic } from './mockData.tokens';
import { type CategoryPhoto, type FeaturedItem } from './mockData.types';
import { premiumPhotoById, premiumPhotos } from './premiumCatalog';

// Public API preserved: symbols extracted to concern siblings are re-exported
// here so every existing `constants/mockData` importer keeps working unchanged.
export { picLarge } from './mockData.tokens';
export type { CategoryPhoto, FeaturedItem } from './mockData.types';
export {
  videoWallpapers,
  type VideoWallpaper,
  dualWallpapers,
  type DualPair,
  type ThemePack,
  themePacks,
  moodAlbums,
  getThemePackPhotos,
  getThemePackById,
} from './mockData.formats';
export { coupleWallpapers, type CoupleWallpaper } from './mockData.couple';
export {
  type Mood,
  moods,
  getMoodById,
  getMoodPhotos,
} from './mockData.mood';
export {
  type SearchableWallpaper,
  searchCatalog,
  searchCategories,
  searchWallpapers,
} from './mockData.search';

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

// The "Premium" collection — curated, subscription-gated images stored in the
// Supabase `premium` bucket (constants/premiumCatalog + scripts/upload-premium.mjs).
// Their ids ('premium-<uuid>') drive the diamond badge + the gatePremium() apply
// lock. Falls back to the free best-picks if the catalog is empty (pre-upload).
const PREMIUM_SECTION: CatalogSection = {
  group: 'category',
  key: 'premium',
  label: 'Premium',
  tier: 'premium',
  photos: premiumPhotos.length
    ? premiumPhotos.map((p) => ({ id: p.id, image: p.image }))
    : bestPicks,
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
  // Premium-collection ids ('premium-<uuid>') → their Supabase Storage URL.
  // Tag 'Premium' + gold accent drive the preview's premium chrome.
  if (id.startsWith('premium-')) {
    const p = premiumPhotoById(id);
    if (p) {
      return { id: p.id, title: 'Premium', tag: 'Premium', image: p.image, accent: Colors.gold };
    }
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
