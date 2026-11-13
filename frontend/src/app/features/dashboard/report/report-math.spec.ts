import { niceCeil, periodAnchor } from './report-math';

describe('niceCeil', () => {
  it.each([
    [0, 1, 1], [0.4, 1, 1], [1, 1, 1], [1.2, 1, 2], [3, 1, 4], [4.5, 1, 6], [7, 1, 8], [9, 1, 10],
    [11, 1, 20], [45, 1, 60], [100, 1, 100], [101, 1, 200], [0, 2, 2], [2, 2, 2], [2.1, 2, 4],
  ])('an axis for %d (minimum %d) tops out at %d', (value, minimum, expected) => {
    expect(niceCeil(value, minimum)).toBe(expected);
  });

  it('always fits the largest value, so no bar is cut off', () => {
    for (let value = 0; value <= 500; value += 0.7) {
      expect(niceCeil(value)).toBeGreaterThanOrEqual(value);
    }
  });
});

describe('periodAnchor', () => {
  const today = new Date(2026, 10, 13);

  it.each([
    ['week', 0, '2026-11-13'], ['week', 1, '2026-11-06'], ['week', 2, '2026-10-30'],
    ['month', 0, '2026-11-01'], ['month', 1, '2026-10-01'], ['month', 11, '2025-12-01'], ['month', 12, '2025-11-01'],
    ['year', 0, '2026-01-01'], ['year', 1, '2025-01-01'],
  ] as const)('%s, %d back, lands in %s', (period, back, expected) => {
    expect(periodAnchor(today, period, back)).toBe(expected);
  });

  it('goes back a month from the 31st without skipping into the wrong month', () => {
    expect(periodAnchor(new Date(2026, 2, 31), 'month', 1)).toBe('2026-02-01');
  });
});
