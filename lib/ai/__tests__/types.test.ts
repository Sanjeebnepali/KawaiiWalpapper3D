import { aspectToSize, type AspectRatio } from '../types';

describe('aspectToSize', () => {
  // Each aspect preset → the exact pixel size from the switch in types.ts.
  it.each<[AspectRatio, { width: number; height: number }]>([
    ['1:1', { width: 1024, height: 1024 }],
    ['9:16', { width: 768, height: 1344 }],
    ['16:9', { width: 1344, height: 768 }],
    ['3:4', { width: 896, height: 1152 }],
    ['4:3', { width: 1152, height: 896 }],
  ])('%s → %o', (aspect, size) => {
    expect(aspectToSize(aspect)).toEqual(size);
  });

  it('1:1 is square', () => {
    const { width, height } = aspectToSize('1:1');
    expect(width).toBe(height);
  });

  it('portrait presets are taller than wide', () => {
    for (const aspect of ['9:16', '3:4'] as AspectRatio[]) {
      const { width, height } = aspectToSize(aspect);
      expect(height).toBeGreaterThan(width);
    }
  });

  it('landscape presets are wider than tall', () => {
    for (const aspect of ['16:9', '4:3'] as AspectRatio[]) {
      const { width, height } = aspectToSize(aspect);
      expect(width).toBeGreaterThan(height);
    }
  });

  it('9:16 and 16:9 are dimension-swapped mirrors', () => {
    const portrait = aspectToSize('9:16');
    const landscape = aspectToSize('16:9');
    expect(portrait.width).toBe(landscape.height);
    expect(portrait.height).toBe(landscape.width);
  });

  it('3:4 and 4:3 are dimension-swapped mirrors', () => {
    const portrait = aspectToSize('3:4');
    const landscape = aspectToSize('4:3');
    expect(portrait.width).toBe(landscape.height);
    expect(portrait.height).toBe(landscape.width);
  });

  it('returns undefined for an off-contract aspect (no default branch)', () => {
    // The switch has no `default`, so an unknown value falls through to
    // an implicit `undefined` return. Documents real behaviour.
    expect(aspectToSize('21:9' as unknown as AspectRatio)).toBeUndefined();
  });
});
