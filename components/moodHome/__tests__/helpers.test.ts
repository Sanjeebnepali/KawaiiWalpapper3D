import { formatHour, formatMinutes, labelForSource, timeAgo } from '../helpers';

describe('formatHour', () => {
  it.each([
    [0, '12 AM'],
    [11, '11 AM'],
    [12, '12 PM'],
    [9, '9 AM'],
    [15, '3 PM'],
    [23, '11 PM'],
  ])('%i → %s', (h, label) => {
    expect(formatHour(h as number)).toBe(label);
  });
});

describe('formatMinutes', () => {
  it.each([
    [30, '30 min'],
    [59, '59 min'],
    [60, '1 hour'],
    [120, '2 hours'],
    [90, '1h 30m'],
    [150, '2h 30m'],
  ])('%i → %s', (m, label) => {
    expect(formatMinutes(m as number)).toBe(label);
  });
});

describe('labelForSource', () => {
  it('maps known sources', () => {
    expect(labelForSource('manual')).toBe('Manual pick');
    expect(labelForSource('camera')).toBe('Camera scan');
    expect(labelForSource('notification')).toBe('Notification');
  });

  it('falls back to the raw value for unknown sources', () => {
    expect(labelForSource('sleepwake')).toBe('sleepwake');
  });
});

describe('timeAgo', () => {
  it('returns "never" for null', () => {
    expect(timeAgo(null)).toBe('never');
  });

  it('formats seconds / minutes / hours / days', () => {
    const now = Date.now();
    expect(timeAgo(now - 5_000)).toMatch(/^\d+s ago$/);
    expect(timeAgo(now - 5 * 60_000)).toBe('5m ago');
    expect(timeAgo(now - 3 * 3_600_000)).toBe('3h ago');
    expect(timeAgo(now - 2 * 86_400_000)).toBe('2d ago');
  });
});
