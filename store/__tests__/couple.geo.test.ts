import {
  correctedDistanceM,
  getBufferZone,
  haversineMeters,
  recomputeDistance,
} from '../couple.geo';
import type { State } from '../couple.types';

function baseState(over: Partial<State> = {}): State {
  return {
    hydrated: true,
    link: null,
    myLat: null,
    myLng: null,
    myUpdatedAt: null,
    myAccuracy: null,
    partnerLat: null,
    partnerLng: null,
    partnerUpdatedAt: null,
    partnerAccuracy: null,
    partnerDistanceM: null,
    proximity: 'unknown',
    couplePackId: null,
    paused: false,
    thresholdM: 100,
    error: null,
    ...over,
  };
}

/** ~metres-north offset in degrees of latitude (1° lat ≈ 111_320 m). */
function metresNorth(m: number): number {
  return m / 111_320;
}

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters(0, 0, 0, 0)).toBeCloseTo(0, 5);
  });

  it('matches a known north offset within 1%', () => {
    const d = haversineMeters(0, 0, metresNorth(100), 0);
    expect(d).toBeGreaterThan(99);
    expect(d).toBeLessThan(101);
  });
});

describe('correctedDistanceM', () => {
  it('collapses to 0 when the raw distance is within the combined GPS error', () => {
    // Phones truly ~3 m apart but GPS reports them 32 m apart, each fix ±25 m.
    // σ² = 25²+25² = 1250 > 32² = 1024 → honest separation is "together".
    expect(correctedDistanceM(32, 25, 25)).toBe(0);
  });

  it('leaves a genuinely-far distance essentially unchanged', () => {
    // 200 m apart with sharp fixes: the small uncertainty barely dents it.
    const out = correctedDistanceM(200, 5, 5);
    expect(out).toBeGreaterThan(198);
    expect(out).toBeLessThanOrEqual(200);
  });

  it('floors each side at the minimum uncertainty when accuracy is null', () => {
    // null → MIN_FIX_UNCERTAINTY_M (10) per side → σ² = 200.
    expect(correctedDistanceM(100, null, null)).toBeCloseTo(Math.sqrt(9800), 3);
  });

  it('uses the larger of reported accuracy and the floor', () => {
    // 5 m reported is below the 10 m floor, so the floor is used (σ²=200),
    // not 5²+5²=50 — close fixes are never trusted to sub-floor precision.
    expect(correctedDistanceM(5, 5, 5)).toBe(0);
  });

  it('never returns NaN or a negative value', () => {
    const out = correctedDistanceM(0, 40, 40);
    expect(out).toBe(0);
    expect(Number.isNaN(out)).toBe(false);
  });
});

describe('recomputeDistance with uncertainty correction', () => {
  it('reports "together" (near 0 m, near) when phones are within GPS error', () => {
    const patch: Partial<State> = {};
    const set = (p: Partial<State>) => Object.assign(patch, p);
    recomputeDistance(
      baseState({
        myLat: 0,
        myLng: 0,
        myAccuracy: 25,
        partnerLat: metresNorth(32),
        partnerLng: 0,
        partnerAccuracy: 25,
      }),
      set,
    );
    expect(patch.partnerDistanceM).toBe(0);
    expect(patch.proximity).toBe('near');
  });

  it('still reports a far partner as far', () => {
    const patch: Partial<State> = {};
    const set = (p: Partial<State>) => Object.assign(patch, p);
    recomputeDistance(
      baseState({
        myLat: 0,
        myLng: 0,
        myAccuracy: 5,
        partnerLat: metresNorth(500),
        partnerLng: 0,
        partnerAccuracy: 5,
        proximity: 'near',
      }),
      set,
    );
    expect(patch.partnerDistanceM).toBeGreaterThan(490);
    expect(patch.proximity).toBe('far');
  });

  it('returns unknown when a coordinate is missing', () => {
    const patch: Partial<State> = {};
    const set = (p: Partial<State>) => Object.assign(patch, p);
    recomputeDistance(baseState({ myLat: 0, myLng: 0 }), set);
    expect(patch.partnerDistanceM).toBeNull();
    expect(patch.proximity).toBe('unknown');
  });
});

describe('getBufferZone', () => {
  it('widens the band as accuracy worsens', () => {
    expect(getBufferZone(5).near).toBeLessThan(getBufferZone(50).near);
  });

  it('scales the band by the configured threshold', () => {
    const base = getBufferZone(5, 100);
    const doubled = getBufferZone(5, 200);
    expect(doubled.near).toBeCloseTo(base.near * 2, 5);
  });
});
