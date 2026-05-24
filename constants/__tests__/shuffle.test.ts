import {
  BATTERY_FLOOR,
  COLLECTION_SIZE,
  FREE_COLLECTION_LIMIT,
  getCollectionIntervalMinutes,
  getNextChangeAt,
  HISTORY_LIMIT,
  isInDnd,
  nextLocalMidnight,
  parseHHMM,
  SHUFFLE_DEFAULTS,
  SHUFFLE_MODES,
  TIMER_OPTIONS,
  WEEKDAY_LABELS,
  type Collection,
  type ShuffleMode,
} from '../shuffle';

/** Build a Collection with sensible defaults, overridable per-test. */
function makeCollection(over: Partial<Collection> = {}): Collection {
  return {
    id: 'c1',
    name: 'Test',
    photoIds: ['p1', 'p2'],
    timerId: '60m',
    mode: 'sequential',
    createdAt: 0,
    ...over,
  };
}

describe('constants / catalogs', () => {
  it('exposes the fixed spec constants', () => {
    expect(COLLECTION_SIZE).toBe(10);
    expect(FREE_COLLECTION_LIMIT).toBe(1);
    expect(HISTORY_LIMIT).toBe(30);
    expect(BATTERY_FLOOR).toBe(15);
  });

  it('WEEKDAY_LABELS is Sunday-first per JS Date semantics', () => {
    expect(WEEKDAY_LABELS).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    // index 0 must be Sunday — getDay() returns 0 for Sunday.
    expect(WEEKDAY_LABELS[0]).toBe('Sun');
    expect(WEEKDAY_LABELS.length).toBe(7);
  });

  it('SHUFFLE_MODES has the four documented modes with the right premium flags', () => {
    const byId = Object.fromEntries(SHUFFLE_MODES.map((m) => [m.id, m]));
    expect(SHUFFLE_MODES.map((m) => m.id).sort()).toEqual(
      ['day', 'random', 'sequential', 'smart'].sort(),
    );
    expect(byId.sequential.premium).toBe(false);
    expect(byId.random.premium).toBe(false);
    expect(byId.day.premium).toBe(false);
    // Only "smart" is premium.
    expect(byId.smart.premium).toBe(true);
  });

  it('TIMER_OPTIONS — free options carry real minute counts', () => {
    const byId = Object.fromEntries(TIMER_OPTIONS.map((t) => [t.id, t]));
    expect(byId['60m'].minutes).toBe(60);
    expect(byId['6h'].minutes).toBe(360);
    expect(byId['12h'].minutes).toBe(720);
    expect(byId['24h'].minutes).toBe(1440);
    expect(byId['60m'].premium).toBe(false);
    expect(byId['24h'].premium).toBe(false);
  });

  it('TIMER_OPTIONS — premium options + custom sentinel', () => {
    const byId = Object.fromEntries(TIMER_OPTIONS.map((t) => [t.id, t]));
    expect(byId['15m'].minutes).toBe(15);
    expect(byId['15m'].premium).toBe(true);
    expect(byId['30m'].minutes).toBe(30);
    expect(byId['30m'].premium).toBe(true);
    // "custom" uses a null minutes sentinel; value lives on the collection.
    expect(byId.custom.minutes).toBeNull();
    expect(byId.custom.premium).toBe(true);
  });

  it('SHUFFLE_DEFAULTS is an empty, paused-off, DnD-off blank state', () => {
    expect(SHUFFLE_DEFAULTS).toEqual({
      collections: [],
      activeCollectionId: null,
      currentIndex: 0,
      history: [],
      paused: false,
      dndStart: null,
      dndEnd: null,
      lastChangedAt: null,
    });
  });
});

describe('getCollectionIntervalMinutes', () => {
  it('returns the option minutes for each known free timer id', () => {
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '60m' }))).toBe(60);
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '6h' }))).toBe(360);
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '12h' }))).toBe(720);
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '24h' }))).toBe(1440);
  });

  it('returns the option minutes for known premium fixed timers', () => {
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '15m' }))).toBe(15);
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '30m' }))).toBe(30);
  });

  it('falls back to 60 when the timer id is unknown (old build)', () => {
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: 'nope' }))).toBe(60);
    expect(getCollectionIntervalMinutes(makeCollection({ timerId: '' }))).toBe(60);
  });

  describe('custom timer', () => {
    it('uses customMinutes when within the [5, 1440] range', () => {
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 45 })),
      ).toBe(45);
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 5 })),
      ).toBe(5); // lower boundary
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 1440 })),
      ).toBe(1440); // upper boundary (24h)
    });

    it('clamps customMinutes below the floor to 5', () => {
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 4 })),
      ).toBe(5);
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 0 })),
      ).toBe(5);
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: -100 })),
      ).toBe(5);
    });

    it('clamps customMinutes above the ceiling to 1440', () => {
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 1441 })),
      ).toBe(1440);
      expect(
        getCollectionIntervalMinutes(makeCollection({ timerId: 'custom', customMinutes: 99999 })),
      ).toBe(1440);
    });

    it('defaults custom to 60 (then clamps) when customMinutes is missing', () => {
      // undefined ?? 60 = 60, which is inside the range → 60.
      expect(getCollectionIntervalMinutes(makeCollection({ timerId: 'custom' }))).toBe(60);
    });
  });
});

describe('nextLocalMidnight', () => {
  it('returns 00:00:00.000 local of the day AFTER the given instant', () => {
    // Build the input in LOCAL time so the assertion is timezone-agnostic.
    const from = new Date(2026, 4, 24, 14, 30, 15, 500).getTime(); // 2026-05-24 14:30:15.500
    const expected = new Date(2026, 4, 25, 0, 0, 0, 0).getTime(); // 2026-05-25 00:00:00
    expect(nextLocalMidnight(from)).toBe(expected);
  });

  it('a time already at local midnight still rolls to the NEXT day', () => {
    const from = new Date(2026, 4, 24, 0, 0, 0, 0).getTime();
    const expected = new Date(2026, 4, 25, 0, 0, 0, 0).getTime();
    expect(nextLocalMidnight(from)).toBe(expected);
  });

  it('crosses month boundaries (last day of month → 1st of next)', () => {
    const from = new Date(2026, 0, 31, 23, 59, 59, 999).getTime(); // Jan 31
    const expected = new Date(2026, 1, 1, 0, 0, 0, 0).getTime(); // Feb 1
    expect(nextLocalMidnight(from)).toBe(expected);
  });

  it('crosses year boundaries (Dec 31 → Jan 1)', () => {
    const from = new Date(2026, 11, 31, 12, 0, 0, 0).getTime();
    const expected = new Date(2027, 0, 1, 0, 0, 0, 0).getTime();
    expect(nextLocalMidnight(from)).toBe(expected);
  });

  it('handles leap-day February correctly (Feb 28 2028 → Feb 29)', () => {
    const from = new Date(2028, 1, 28, 8, 0, 0, 0).getTime(); // 2028 is a leap year
    const expected = new Date(2028, 1, 29, 0, 0, 0, 0).getTime();
    expect(nextLocalMidnight(from)).toBe(expected);
  });

  it('result is always strictly after the input', () => {
    const from = new Date(2026, 6, 4, 9, 15, 0, 0).getTime();
    expect(nextLocalMidnight(from)).toBeGreaterThan(from);
  });
});

describe('getNextChangeAt', () => {
  const ONE_MIN = 60_000;

  it('day mode fires at the next local midnight (ignores the timer)', () => {
    const last = new Date(2026, 4, 24, 14, 0, 0, 0).getTime();
    const c = makeCollection({ mode: 'day', timerId: '24h' });
    expect(getNextChangeAt(c, last)).toBe(nextLocalMidnight(last));
    // And explicitly the next calendar midnight.
    expect(getNextChangeAt(c, last)).toBe(new Date(2026, 4, 25, 0, 0, 0, 0).getTime());
  });

  it('sequential mode = lastChangedAt + interval', () => {
    const last = 1_000_000;
    const c = makeCollection({ mode: 'sequential', timerId: '60m' });
    expect(getNextChangeAt(c, last)).toBe(last + 60 * ONE_MIN);
  });

  it('random mode = lastChangedAt + interval', () => {
    const last = 5_000;
    const c = makeCollection({ mode: 'random', timerId: '15m' });
    expect(getNextChangeAt(c, last)).toBe(last + 15 * ONE_MIN);
  });

  it('smart mode = lastChangedAt + interval', () => {
    const last = 0;
    const c = makeCollection({ mode: 'smart', timerId: '6h' });
    expect(getNextChangeAt(c, last)).toBe(360 * ONE_MIN);
  });

  it('uses the clamped custom interval for non-day modes', () => {
    const last = 100;
    const c = makeCollection({ mode: 'sequential', timerId: 'custom', customMinutes: 2 });
    // 2 is clamped up to 5 minutes.
    expect(getNextChangeAt(c, last)).toBe(last + 5 * ONE_MIN);
  });

  it('falls back to a 60-min interval for an unknown timer id (non-day)', () => {
    const last = 42;
    const c = makeCollection({ mode: 'random', timerId: 'bogus' });
    expect(getNextChangeAt(c, last)).toBe(last + 60 * ONE_MIN);
  });

  it.each<[ShuffleMode]>([['sequential'], ['random'], ['smart']])(
    '%s mode is timer-driven, not midnight-driven',
    (mode) => {
      const last = new Date(2026, 4, 24, 23, 0, 0, 0).getTime();
      const c = makeCollection({ mode, timerId: '60m' });
      // 60 min after 23:00 = 00:00 next day, which happens to equal midnight,
      // but the math is interval-based, not the midnight helper. Use a
      // non-aligned interval to prove it.
      const c2 = makeCollection({ mode, timerId: '6h' });
      expect(getNextChangeAt(c2, last)).toBe(last + 360 * ONE_MIN);
      expect(getNextChangeAt(c, last)).toBe(last + 60 * ONE_MIN);
    },
  );
});

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
