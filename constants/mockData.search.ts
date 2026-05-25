import { dedupeCatalogPhotos } from './catalogDedupe';
import { Colors } from './theme';
import { catalogSections } from './wallpaperCatalog';

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
  // Drop the WebP+PNG doubles so search results (and the shuffle / mood-pool
  // pickers this list backs) show each wallpaper once. See catalogDedupe.
  dedupeCatalogPhotos(s.photos).map((p, i) => ({
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
