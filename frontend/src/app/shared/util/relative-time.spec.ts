import { relativeTime } from './relative-time';

// Noon on a Thursday, local time, so "yesterday" arithmetic never crosses a month boundary by accident.
const NOW = new Date(2026, 10, 12, 12, 0, 0);
const MIN = 60_000;
const HOUR = 60 * MIN;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  it.each([
    [0, 'Vừa xong'],
    [44_000, 'Vừa xong'],
    [45_000, '1 phút trước'],
    [59 * MIN, '59 phút trước'],
    [HOUR, '1 giờ trước'],
    [5 * HOUR, '5 giờ trước'],
    [11 * HOUR + 59 * MIN, '11 giờ trước'],
  ])('%i ms ago reads "%s"', (ms, expected) => {
    expect(relativeTime(ago(ms), NOW)).toBe(expected);
  });

  it('a timestamp slightly in the future (clock skew) reads as just now', () => {
    expect(relativeTime(new Date(NOW.getTime() + 20_000).toISOString(), NOW)).toBe('Vừa xong');
  });

  it('uses calendar days: 23:50 yesterday is "Hôm qua" although it was only 12 hours ago', () => {
    expect(relativeTime(new Date(2026, 10, 11, 23, 50).toISOString(), NOW)).toBe('Hôm qua');
  });

  it('one hour ago just after midnight is still "giờ trước" only if it is the same calendar day', () => {
    const early = new Date(2026, 10, 12, 0, 30);
    const justAfter = new Date(2026, 10, 12, 1, 30);

    expect(relativeTime(early.toISOString(), justAfter)).toBe('1 giờ trước');
    expect(relativeTime(new Date(2026, 10, 11, 23, 30).toISOString(), justAfter)).toBe('Hôm qua');
  });

  it.each([
    [2, '2 ngày trước'],
    [6, '6 ngày trước'],
  ])('%i days back reads "%s"', (days, expected) => {
    expect(relativeTime(new Date(2026, 10, 12 - days, 9).toISOString(), NOW)).toBe(expected);
  });

  it('a week or more ago shows the date, zero padded', () => {
    expect(relativeTime(new Date(2026, 10, 5, 9).toISOString(), NOW)).toBe('05/11/2026');
    expect(relativeTime(new Date(2025, 0, 3, 9).toISOString(), NOW)).toBe('03/01/2025');
  });
});
