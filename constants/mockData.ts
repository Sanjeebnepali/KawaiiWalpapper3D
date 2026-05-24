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
import { FEATURED_PREMIUM_ID, premiumPhotoById, premiumPhotos } from './premiumCatalog';

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

// Hand-picked "Best Fit" home grid (owner-curated, FREE — never premium). Each
// category is a row of 3 in the 3-col grid. Some tiles are specific uploaded
// images (wallpapers/category/<key>/<file>); the rest keep existing catalog
// images. Edit the list below to recurate.
const SB_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
/** A specific uploaded image picked for a Best Fit tile. */
function bfPhoto(key: string, file: string): CategoryPhoto {
  return {
    id: `bf-${key}-${file.replace(/\.[^.]+$/, '')}`,
    image: `${SB_URL}/storage/v1/object/public/wallpapers/category/${key}/${file}`,
  };
}
/** First `n` existing catalog photos of a category (for kept tiles). */
function catPhotos(key: string, n: number): CategoryPhoto[] {
  return (sectionByKey('category', key)?.photos ?? []).slice(0, n);
}
export const bestPicks: CategoryPhoto[] = [
  // Painting — keep #1, then two hand-picked.
  ...catPhotos('painting', 1),
  bfPhoto('painting', 'a3a932eb-d7bd-40e2-8692-6dd6d9222204.png'),
  bfPhoto('painting', '734f7490-8b2f-4b8e-96f4-2f341efac069.png'),
  // Playing-game — NEW row, right after painting.
  bfPhoto('playing-game', '05d13085-7a4d-4569-b6e3-c07d0a09af66.png'),
  bfPhoto('playing-game', '7d3379b3-f0a2-410a-ae03-722eeff4a50d.png'),
  bfPhoto('playing-game', '536a274e-bbee-4445-a98c-4362ac7d1c3c.png'),
  // Football — keep #1 #2, hand-picked #3.
  ...catPhotos('football', 2),
  bfPhoto('football', 'ddae626d-83f0-4de4-9aac-e70d5c141ac1.png'),
  // Studying — keep #1 #2, hand-picked #3.
  ...catPhotos('studying', 2),
  bfPhoto('studying', 'fd3a40c4-8ffc-43c4-918a-16aa9248dcb8.png'),
  // Dance — keep #1 #2, hand-picked #3.
  ...catPhotos('dance', 2),
  bfPhoto('dance', 'cd3c4e31-32f4-4ebd-bea8-f5494c91b246.png'),
  // Cooking — two hand-picked, keep one catalog tile.
  bfPhoto('cooking', '86ada00c-8d59-4bc2-ad4f-c5ac1e8dabbe.png'),
  bfPhoto('cooking', '93496523-7db6-4527-a59f-2325e2bcbaa4.png'),
  ...catPhotos('cooking', 1),
  // Gardening — replaces Photography; three hand-picked.
  bfPhoto('gardening', 'bcc748f2-1588-4559-b756-3385fdbb431e.png'),
  bfPhoto('gardening', 'ac6aefc2-33a8-481e-a9c1-0d7e6c79b506.png'),
  bfPhoto('gardening', '3813c364-fba4-42c3-921b-2c4a99978e0b.png'),
  // Remain-as-is rows (already good).
  ...catPhotos('stylish', 3),
  ...(sectionByKey('mood', 'love')?.photos ?? []).slice(0, 2),
  ...(sectionByKey('2d', 'mixed')?.photos ?? []).slice(0, 2),
  ...(sectionByKey('mood', 'happy')?.photos ?? []).slice(0, 1),
];

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

// "Best Fit" — the FREE curated picks shown in the home teaser (BestPicksGrid)
// AND its See-all browse (/category/bestfit). Kept entirely separate from
// PREMIUM_SECTION so subscription images NEVER appear in this free surface.
const BESTFIT_SECTION: CatalogSection = {
  group: 'category',
  key: 'bestfit',
  label: 'Best Fit',
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
  if (id === 'bestfit' || id === 'category-bestfit') return BESTFIT_SECTION;
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
// Featured "2D Kawaii" headline — a hand-picked uploaded 2D image (free).
const FEATURED_2D_ID = 'featured-2d-nervous';
const FEATURED_2D_IMAGE = `${SB_URL}/storage/v1/object/public/wallpapers/2d/nervous/33bfb1fb-45c8-4eaa-8092-7f426b8040ac.png`;

const FEATURED_PICKS: { group: 'category' | 'mood' | '2d'; key: string; tag: string }[] = [
  { group: 'category', key: 'stylish', tag: 'Premium' },
  { group: 'mood', key: 'love', tag: 'Trending' },
  { group: 'category', key: 'photography', tag: 'New Drop' },
  { group: '2d', key: 'mixed', tag: '2D Kawaii' },
  { group: 'category', key: 'dance', tag: 'Hot' },
  { group: 'mood', key: 'happy', tag: 'Live' },
];
export const featured: FeaturedItem[] = FEATURED_PICKS.flatMap((p, i) => {
  // The 'Premium' headline showcases the real premium collection (gold tag +
  // diamond + paywall on apply), not a free category image. Uses the first
  // premium image — swap premiumPhotos[0] for a hand-picked "best" one anytime.
  if (p.tag === 'Premium' && premiumPhotos.length > 0) {
    const pp = premiumPhotoById(FEATURED_PREMIUM_ID) ?? premiumPhotos[0];
    return [{ id: pp.id, title: 'Premium', tag: 'Premium', image: pp.image, accent: Colors.gold, premium: true }];
  }
  // The '2D Kawaii' headline uses a hand-picked uploaded 2D image (FREE).
  if (p.tag === '2D Kawaii') {
    return [{ id: FEATURED_2D_ID, title: '2D Kawaii', tag: '2D Kawaii', image: FEATURED_2D_IMAGE, accent: ACCENTS[i % ACCENTS.length] }];
  }
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
  // Hand-picked Best Fit tiles (uploaded images not in the numbered catalog).
  const bf = bestPicks.find((p) => p.id === id);
  if (bf) return { id: bf.id, title: 'Best Fit', tag: 'Wallpaper', image: bf.image, accent: Colors.pink };
  // No real asset backs this id (CORE-7). Previously a "slug-N" id matched a
  // generic regex and got a fabricated `pic(id)` (random picsum) URL — so a
  // stale favorite id from an older catalog rendered an unrelated stock image
  // in preview/apply instead of a missing-asset state. Return undefined and
  // let the caller render an "unavailable" state.
  return undefined;
}
