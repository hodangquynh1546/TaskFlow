import { describeTimeBlock } from './time-block';

const NOW = new Date(2026, 10, 12, 10, 0);
const at = (h: number, m = 0, day = 12, year = 2026) => new Date(year, 10, day, h, m).toISOString();

describe('describeTimeBlock', () => {
  it('a task with neither a start nor a length has no block', () => {
    expect(describeTimeBlock({ startDate: null, durationMinutes: null }, NOW)).toBeNull();
  });

  it('a start and a length give the range and the length', () => {
    expect(describeTimeBlock({ startDate: at(9, 0), durationMinutes: 90 }, NOW)).toEqual({
      when: '12/11, 09:00–10:30',
      duration: '1 giờ 30 phút',
      title: '12/11, 09:00–10:30 (1 giờ 30 phút)',
    });
  });

  it('a start alone gives just the time', () => {
    expect(describeTimeBlock({ startDate: at(14, 15), durationMinutes: null }, NOW)).toEqual({ when: '12/11, 14:15', duration: null, title: '12/11, 14:15' });
  });

  it('a length alone is an estimate, not a place on the calendar', () => {
    expect(describeTimeBlock({ startDate: null, durationMinutes: 45 }, NOW)).toEqual({ when: 'Dự kiến', duration: '45 phút', title: 'Dự kiến 45 phút' });
  });

  it('shows the year only when it is not the current one', () => {
    expect(describeTimeBlock({ startDate: at(9, 0, 5, 2027), durationMinutes: 30 }, NOW)!.when).toBe('05/11/2027, 09:00–09:30');
    expect(describeTimeBlock({ startDate: at(9, 0, 5, 2026), durationMinutes: 30 }, NOW)!.when).toBe('05/11, 09:00–09:30');
  });

  it('a block ending exactly at midnight reads 24:00 as 00:00 of the next day, never "—"', () => {
    expect(describeTimeBlock({ startDate: at(22, 0), durationMinutes: 120 }, NOW)!.when).toBe('12/11, 22:00–00:00');
  });
});
