import {
  DURATION_PRESETS,
  blockEnd,
  combineDateAndTime,
  crossesMidnight,
  formatClock,
  formatDuration,
  formatTimeRange,
  isValidClock,
} from './duration';

describe('DURATION_PRESETS', () => {
  it('are the quick choices: 15 and 30 minutes, then 1, 2, 3 and 4 hours', () => {
    expect(DURATION_PRESETS).toEqual([15, 30, 60, 120, 180, 240]);
  });
});

describe('formatDuration', () => {
  it.each([
    [1, '1 phút'],
    [15, '15 phút'],
    [30, '30 phút'],
    [45, '45 phút'],
    [59, '59 phút'],
    [60, '1 giờ'],
    [75, '1 giờ 15 phút'],
    [90, '1 giờ 30 phút'],
    [120, '2 giờ'],
    [180, '3 giờ'],
    [240, '4 giờ'],
    [1440, '24 giờ'],
  ])('%i minutes reads "%s"', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});

describe('formatClock and formatTimeRange', () => {
  it('pads hours and minutes', () => {
    expect(formatClock(new Date(2026, 0, 1, 9, 5))).toBe('09:05');
    expect(formatClock(new Date(2026, 0, 1, 0, 0))).toBe('00:00');
    expect(formatClock(new Date(2026, 0, 1, 23, 59))).toBe('23:59');
  });

  it('a range runs from start to start plus the length', () => {
    expect(formatTimeRange(new Date(2026, 10, 12, 9, 0).toISOString(), 90)).toBe('09:00–10:30');
    expect(formatTimeRange(new Date(2026, 10, 12, 9, 45).toISOString(), 15)).toBe('09:45–10:00');
  });

  it('without a length only the start is shown', () => {
    expect(formatTimeRange(new Date(2026, 10, 12, 9, 0).toISOString(), null)).toBe('09:00');
  });

  it('blockEnd adds minutes across the hour', () => {
    expect(blockEnd(new Date(2026, 10, 12, 9, 50), 20)).toEqual(new Date(2026, 10, 12, 10, 10));
  });
});

describe('crossesMidnight', () => {
  const start = (h: number, m: number) => new Date(2026, 10, 12, h, m);

  it.each([
    [start(9, 0), 60, false],
    [start(22, 0), 120, false], // ends exactly at midnight
    [start(23, 59), 1, false],
    [start(23, 59), 2, true],
    [start(23, 0), 61, true],
    [start(0, 0), 1440, false], // the whole day
    [start(0, 0), 1441, true],
  ])('%s for %i minutes = %s', (s, minutes, expected) => {
    expect(crossesMidnight(s, minutes)).toBe(expected);
  });

  it('works across a month end', () => {
    expect(crossesMidnight(new Date(2026, 10, 30, 23, 0), 120)).toBe(true);
    expect(crossesMidnight(new Date(2026, 10, 30, 22, 0), 120)).toBe(false);
  });
});

describe('combineDateAndTime', () => {
  const day = new Date(2026, 10, 12, 18, 40, 30);

  it.each([
    ['09:30', 9, 30],
    ['9:05', 9, 5],
    ['00:00', 0, 0],
    ['23:59', 23, 59],
    [' 14:15 ', 14, 15],
  ])('%j gives %i:%i on the chosen day', (time, h, m) => {
    expect(combineDateAndTime(day, time)).toEqual(new Date(2026, 10, 12, h, m, 0, 0));
  });

  it.each([[''], [null], [undefined], ['nonsense'], ['24:00'], ['12:60'], ['7']])('treats %j as no time: the start of the day', (time) => {
    expect(combineDateAndTime(day, time as string | null | undefined)).toEqual(new Date(2026, 10, 12, 0, 0, 0, 0));
  });

  it('never carries over the time of the date that was passed in', () => {
    expect(combineDateAndTime(day, '').getSeconds()).toBe(0);
  });
});

describe('isValidClock', () => {
  it.each([['00:00', true], ['9:05', true], ['23:59', true], ['24:00', false], ['12:60', false], ['', false], [null, false], ['9', false]])('%j is %s', (text, expected) => {
    expect(isValidClock(text as string | null)).toBe(expected);
  });
});
