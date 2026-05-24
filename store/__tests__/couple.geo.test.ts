import { getBufferZone, haversineMeters } from '../couple.geo';

describe('haversineMeters', () => {
  it('is 0 for identical points', () => {
    expect(haversineMeters(40.7, -74, 40.7, -74)).toBe(0);
  });

  it('≈111.2 km for 1° of latitude (anywhere)', () => {
    const d = haversineMeters(0, 0, 1, 0);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('≈111.2 km for 1° of longitude at the equator', () => {
    const d = haversineMeters(0, 0, 0, 1);
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('a degree of longitude shrinks away from the equator', () => {
    expect(haversineMeters(60, 0, 60, 1)).toBeLessThan(haversineMeters(0, 0, 0, 1));
  });

  it('is symmetric', () => {
    expect(haversineMeters(10, 20, 12, 25)).toBeCloseTo(
      haversineMeters(12, 25, 10, 20),
      6,
    );
  });
});

describe('getBufferZone', () => {
  it('uses the widest band when accuracy is unknown', () => {
    expect(getBufferZone(null)).toEqual({ near: 150, far: 200 });
  });

  it('tight band for a good fix (<10 m)', () => {
    expect(getBufferZone(5)).toEqual({ near: 80, far: 120 });
  });

  it('mid band for typical urban (<30 m)', () => {
    expect(getBufferZone(20)).toEqual({ near: 100, far: 150 });
  });

  it('wide band for poor accuracy (≥30 m)', () => {
    expect(getBufferZone(50)).toEqual({ near: 150, far: 200 });
  });

  it('default threshold (100) reproduces the base band exactly', () => {
    expect(getBufferZone(5, 100)).toEqual({ near: 80, far: 120 });
  });

  it('scales the band proportionally by thresholdM/100', () => {
    expect(getBufferZone(5, 200)).toEqual({ near: 160, far: 240 });
  });

  it('clamps the scale to [0.2, 5]', () => {
    expect(getBufferZone(5, 1)).toEqual({ near: 16, far: 24 }); // 0.2× floor
    expect(getBufferZone(5, 100_000)).toEqual({ near: 400, far: 600 }); // 5× ceiling
  });
});
