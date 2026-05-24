import { GpsKalmanFilter, acceptFix, resetMyFix } from '../gpsFilter';

describe('GpsKalmanFilter', () => {
  it('reduces jitter on a stationary noisy signal vs the raw fixes', () => {
    const f = new GpsKalmanFilter(2);
    const lat = 27.7;
    const lng = 85.3;
    // ±0.0002° ≈ ±22 m of noise around a fixed point, phone not moving.
    const noise = [
      0.0002, -0.0002, 0.00015, -0.00018, 0.0001, -0.00012, 0.00009, -0.00008,
      0.00011, -0.0001,
    ];
    const rawTail: number[] = [];
    const filteredTail: number[] = [];
    noise.forEach((n, i) => {
      const r = f.process(lat + n, lng, 10, i * 3000);
      if (i >= 6) {
        rawTail.push(lat + n);
        filteredTail.push(r.lat);
      }
    });
    const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    // The smoothed tail swings less than the raw tail — that's the whole point.
    expect(range(filteredTail)).toBeLessThan(range(rawTail));
  });

  it('still tracks real sustained movement', () => {
    const f = new GpsKalmanFilter(2);
    f.process(27.7, 85.3, 10, 0);
    let r = { lat: 27.7, lng: 85.3, accuracy: 0 };
    for (let i = 1; i <= 10; i++) {
      // Walking steadily north, 0.0005°/step ≈ 55 m/step.
      r = f.process(27.7 + i * 0.0005, 85.3, 10, i * 3000);
    }
    // Followed most of the way toward the latest position (not stuck behind).
    expect(r.lat).toBeGreaterThan(27.7 + 0.003);
  });

  it('takes the first fix after reset as-is', () => {
    const f = new GpsKalmanFilter(2);
    f.process(10, 10, 5, 0);
    f.reset();
    const r = f.process(50, 50, 5, 1000);
    expect(r.lat).toBe(50);
    expect(r.lng).toBe(50);
  });
});

describe('acceptFix (outlier gate)', () => {
  beforeEach(() => resetMyFix());

  it('accepts the first fix regardless of accuracy', () => {
    expect(acceptFix(27.7, 85.3, 200, 0)).toBe(true);
  });

  it('rejects a teleport (impossible speed since last fix)', () => {
    expect(acceptFix(27.7, 85.3, 10, 0)).toBe(true);
    // ~1.1 km away 1 s later ⇒ ~1100 m/s — impossible.
    expect(acceptFix(27.71, 85.3, 10, 1000)).toBe(false);
  });

  it('accepts realistic walking movement', () => {
    expect(acceptFix(27.7, 85.3, 10, 0)).toBe(true);
    // ~1.7 m north 1 s later ⇒ walking pace.
    expect(acceptFix(27.700015, 85.3, 10, 1000)).toBe(true);
  });

  it('rejects a too-vague fix when a recent good one exists', () => {
    expect(acceptFix(27.7, 85.3, 10, 0)).toBe(true);
    expect(acceptFix(27.7, 85.3, 250, 1000)).toBe(false);
  });
});
