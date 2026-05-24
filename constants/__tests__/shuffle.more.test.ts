import { isInDnd, parseHHMM } from '../shuffle';

describe('isInDnd', () => {
  describe('normal window (start < end, no midnight wrap)', () => {
    // 09:00 → 17:00  ==>  540 .. 1020
    const start = 9 * 60;
    const end = 17 * 60;

    it('inside the window is true', () => {
      expect(isInDnd(12 * 60, start, end)).toBe(true);
    });

    it('start boundary is inclusive', () => {
      expect(isInDnd(start, start, end)).toBe(true);
    });

    it('end boundary is exclusive', () => {
      expect(isInDnd(end, start, end)).toBe(false);
    });

    it('just before the start is false', () => {
      expect(isInDnd(start - 1, start, end)).toBe(false);
    });

    it('just before the end is true', () => {
      expect(isInDnd(end - 1, start, end)).toBe(true);
    });

    it('well outside the window is false', () => {
      expect(isInDnd(3 * 60, start, end)).toBe(false);
      expect(isInDnd(22 * 60, start, end)).toBe(false);
    });
  });

  describe('wrap-around window (end < start, spans midnight)', () => {
    // 22:00 → 07:00  ==>  1320 .. 420
    const start = 22 * 60;
    const end = 7 * 60;

    it('late-night side (>= start) is true', () => {
      expect(isInDnd(23 * 60, start, end)).toBe(true);
    });

    it('early-morning side (< end) is true', () => {
      expect(isInDnd(3 * 60, start, end)).toBe(true);
    });

    it('start boundary is inclusive', () => {
      expect(isInDnd(start, start, end)).toBe(true);
    });

    it('end boundary is exclusive', () => {
      expect(isInDnd(end, start, end)).toBe(false);
    });

    it('exactly at midnight (0) is inside the wrapped window', () => {
      expect(isInDnd(0, start, end)).toBe(true);
    });

    it('the daytime gap is outside the window', () => {
      expect(isInDnd(12 * 60, start, end)).toBe(false);
      expect(isInDnd(end + 1, start, end)).toBe(false); // 07:01
      expect(isInDnd(start - 1, start, end)).toBe(false); // 21:59
    });
  });

  describe('degenerate window (start == end)', () => {
    // Hits the non-wrap branch: now >= s && now < s → always false.
    it('is never inside when start equals end', () => {
      expect(isInDnd(600, 600, 600)).toBe(false);
      expect(isInDnd(0, 600, 600)).toBe(false);
      expect(isInDnd(1439, 600, 600)).toBe(false);
    });
  });
});

describe('parseHHMM', () => {
  it('parses HH:MM into minutes-since-midnight', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('09:30')).toBe(9 * 60 + 30);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
    expect(parseHHMM('12:00')).toBe(720);
  });

  it('accepts a single-digit hour (1–2 digit hour allowed)', () => {
    expect(parseHHMM('9:05')).toBe(9 * 60 + 5);
    expect(parseHHMM('0:00')).toBe(0);
  });

  it('requires a two-digit minute', () => {
    expect(parseHHMM('9:5')).toBeNull();
    expect(parseHHMM('09:5')).toBeNull();
  });

  it('rejects out-of-range hours (>23)', () => {
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('99:00')).toBeNull();
  });

  it('rejects out-of-range minutes (>59)', () => {
    expect(parseHHMM('10:60')).toBeNull();
    expect(parseHHMM('10:99')).toBeNull();
  });

  it('rejects malformed / non-matching strings', () => {
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM('1234')).toBeNull();
    expect(parseHHMM('12-30')).toBeNull();
    expect(parseHHMM('12:30:00')).toBeNull();
    expect(parseHHMM('ab:cd')).toBeNull();
    expect(parseHHMM(' 12:30')).toBeNull(); // leading space breaks the anchored regex
    expect(parseHHMM('12:30 ')).toBeNull(); // trailing space too
    expect(parseHHMM('100:00')).toBeNull(); // 3-digit hour not allowed by regex
  });

  it('round-trips with the DnD minute model', () => {
    const mins = parseHHMM('22:00');
    expect(mins).toBe(1320);
    // sanity: that minute is inside a 22:00→07:00 DnD window
    expect(isInDnd(mins as number, 22 * 60, 7 * 60)).toBe(true);
  });
});
