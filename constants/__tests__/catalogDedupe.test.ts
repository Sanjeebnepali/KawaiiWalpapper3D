import { dedupeCatalogPhotos } from '../catalogDedupe';
import { catalogSections } from '../wallpaperCatalog';

const webp = (n: string) => ({
  id: `id-${n}`,
  image: `https://x/cat/${n}.webp?v=2`,
});
const png = (n: string) => ({
  id: `id-${n}`,
  image: `https://x/cat/${n}.png?v=2`,
});

describe('dedupeCatalogPhotos', () => {
  it('drops PNG originals when the set also has optimized WebP exports', () => {
    const mixed = [webp('001'), webp('002'), png('uuid-a'), png('uuid-b')];
    expect(dedupeCatalogPhotos(mixed)).toEqual([webp('001'), webp('002')]);
  });

  it('keeps a PNG-only set untouched (e.g. the premium collection)', () => {
    const pngOnly = [png('uuid-a'), png('uuid-b')];
    expect(dedupeCatalogPhotos(pngOnly)).toEqual(pngOnly);
  });

  it('keeps a WebP-only set untouched', () => {
    const webpOnly = [webp('001'), webp('002')];
    expect(dedupeCatalogPhotos(webpOnly)).toEqual(webpOnly);
  });

  it('returns [] for an empty set', () => {
    expect(dedupeCatalogPhotos([])).toEqual([]);
  });

  it('removes every WebP+PNG double from the real catalog', () => {
    for (const s of catalogSections) {
      const out = dedupeCatalogPhotos(s.photos);
      // No image survives twice.
      const urls = out.map((p) => p.image.split('?')[0]);
      expect(new Set(urls).size).toBe(out.length);
      // Any section that had a WebP is now WebP-only.
      const hadWebp = s.photos.some((p) => p.image.split('?')[0].endsWith('.webp'));
      if (hadWebp) {
        expect(out.every((p) => p.image.split('?')[0].endsWith('.webp'))).toBe(true);
      }
    }
  });
});
