// Catalog hygiene: collapse duplicate wallpapers that exist in the bucket under
// two formats. Pure, no React/Expo deps so it unit-tests in isolation.

/**
 * Some bucket folders contain BOTH the optimized `NNN.webp` exports AND the
 * original `<uuid>.png` source images of the SAME wallpapers — the PNG
 * originals leaked back into the bucket after the WebP optimize pass (see
 * image-pipeline/optimize.js). Because the catalog is a faithful inventory of
 * the bucket (image-pipeline/refresh-manifest-from-bucket.mjs), it listed each
 * such image twice, so a category grid rendered every wallpaper a second time.
 *
 * Evidence the WebP set is the canonical, complete superset (changes/167):
 *   - In every affected section the sorted WebP list and sorted PNG list are
 *     the SAME images in the SAME order (verified pixel-for-pixel on
 *     football 001↔04c5/002↔2795 and painting 001↔first/010↔last).
 *   - webp_count >= png_count in all 8 mixed sections, so every PNG has a WebP
 *     counterpart but not vice-versa — keeping WebP never drops a unique image.
 *
 * Rule: if a set contains any `.webp`, return only its `.webp` photos. A
 * PNG-only set (e.g. the premium collection — premiumCatalog.ts) has no WebP,
 * so it is returned untouched. Generic over the photo shape so it preserves the
 * caller's element type (CatalogPhoto, CategoryPhoto, …).
 */
export function dedupeCatalogPhotos<T extends { image: string }>(photos: T[]): T[] {
  const hasWebp = photos.some((p) => isWebp(p.image));
  return hasWebp ? photos.filter((p) => isWebp(p.image)) : photos;
}

/** True when the image URL's path ends in `.webp`, ignoring any `?v=2`-style
 *  cache-buster query the bucket URLs carry. */
function isWebp(image: string): boolean {
  const path = image.split('?')[0];
  return path.toLowerCase().endsWith('.webp');
}
