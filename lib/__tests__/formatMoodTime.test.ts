import { formatTime } from '../formatMoodTime';

describe('formatTime', () => {
  it('prefixes "Today" for a same-calendar-day timestamp', () => {
    const t = new Date();
    t.setHours(1, 5, 0, 0); // 01:05 today (same calendar day regardless of now)
    expect(formatTime(t.getTime())).toMatch(/^Today \d{2}:\d{2}$/);
  });

  it('prefixes "Yesterday" for a one-day-earlier timestamp', () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    y.setHours(9, 15, 0, 0);
    expect(formatTime(y.getTime())).toMatch(/^Yesterday \d{2}:\d{2}$/);
  });

  it('uses "Mon D, HH:MM" for older dates', () => {
    const old = new Date();
    old.setMonth(old.getMonth() - 2); // ~2 months ago — never today/yesterday
    expect(formatTime(old.getTime())).toMatch(/^[A-Z][a-z]{2} \d{1,2}, \d{2}:\d{2}$/);
  });
});
