/**
 * Turn manifest.json into constants/wallpaperCatalog.ts — the app's single
 * source of truth for real wallpapers. URLs are the deterministic Supabase
 * public paths (valid the moment upload.js runs; no upload needed to
 * generate this file).
 */
const fs = require('fs');
const path = require('path');

const manifest = require('./manifest.json');
const OUT = path.join(__dirname, '..', 'constants', 'wallpaperCatalog.ts');

const sections = [];
for (const group of ['mood', 'category', '2d']) {
  const g = manifest.groups[group] || {};
  for (const key of Object.keys(g)) {
    const sec = g[key];
    sections.push({
      group,
      key,
      label: sec.label,
      tier: sec.tier,
      photos: sec.items.map((it) => ({ id: it.id, image: it.url })),
    });
  }
}

const header = `// AUTO-GENERATED from image-pipeline/manifest.json — do NOT edit by hand.
// Regenerate: node image-pipeline/gen-catalog.js
// Real wallpapers hosted on Supabase Storage (bucket "${manifest.bucket}").

export type CatalogGroup = 'mood' | 'category' | '2d';
export type CatalogPhoto = { id: string; image: string };
export type CatalogSection = {
  key: string;
  label: string;
  group: CatalogGroup;
  tier: 'free' | 'premium';
  photos: CatalogPhoto[];
};

export const catalogSections: CatalogSection[] = ${JSON.stringify(sections, null, 2)};

export const moodSections = catalogSections.filter((s) => s.group === 'mood');
export const categorySections = catalogSections.filter((s) => s.group === 'category');
export const twoDSections = catalogSections.filter((s) => s.group === '2d');

/** Flat id → photo index, for resolving favorites / previews / history. */
export const catalogById: Record<string, CatalogPhoto> = (() => {
  const m: Record<string, CatalogPhoto> = {};
  for (const s of catalogSections) for (const p of s.photos) m[p.id] = p;
  return m;
})();

export function sectionByKey(
  group: CatalogGroup,
  key: string,
): CatalogSection | undefined {
  return catalogSections.find((s) => s.group === group && s.key === key);
}

export function catalogPhotos(group: CatalogGroup, key: string): CatalogPhoto[] {
  return sectionByKey(group, key)?.photos ?? [];
}
`;

fs.writeFileSync(OUT, header);
const total = sections.reduce((n, s) => n + s.photos.length, 0);
console.log(`wrote ${OUT}`);
console.log(`${sections.length} sections, ${total} photos.`);
