import { describeDue, formatDue } from './due';

// Local-time constructors so the tests do not depend on the machine's time zone.
const NOW = new Date(2026, 10, 12, 10, 0, 0);
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatDue', () => {
  it('shows date and time, zero-padded', () => {
    expect(formatDue(new Date(2026, 0, 5, 9, 7))).toBe('05/01/2026 09:07');
  });

  it('shows only the date at 23:59, the end-of-day default used when no time is chosen', () => {
    expect(formatDue(new Date(2026, 10, 20, 23, 59))).toBe('20/11/2026');
  });

  it('still shows 23:58 and 00:00 as times', () => {
    expect(formatDue(new Date(2026, 10, 20, 23, 58))).toBe('20/11/2026 23:58');
    expect(formatDue(new Date(2026, 10, 20, 0, 0))).toBe('20/11/2026 00:00');
  });
});

describe('describeDue', () => {
  it('reports a missing due date', () => {
    expect(describeDue(null, 'Todo', NOW)).toMatchObject({ kind: 'none', text: 'Chưa đặt hạn' });
  });

  it('a completed task is never flagged, even long past due', () => {
    const result = describeDue(at(-30 * DAY), 'Completed', NOW);

    expect(result.kind).toBe('done');
    expect(result.text).toMatch(/^Hạn \d{2}\/\d{2}\/\d{4}/);
  });

  describe('overdue (strictly past the due time)', () => {
    it('a task due exactly now is not overdue', () => {
      expect(describeDue(at(0), 'Todo', NOW).kind).not.toBe('overdue');
    });

    it.each([
      [-1_000, 'Quá hạn 1 phút'],
      [-59 * MIN - 59_000, 'Quá hạn 59 phút'],
      [-HOUR, 'Quá hạn 1 giờ'],
      [-23 * HOUR - 59 * MIN, 'Quá hạn 23 giờ'],
      [-DAY, 'Quá hạn 1 ngày'],
      [-5 * DAY, 'Quá hạn 5 ngày'],
    ])('%i ms from now reads "%s"', (offset, text) => {
      expect(describeDue(at(offset), 'InProgress', NOW)).toMatchObject({ kind: 'overdue', text });
    });

    it('applies to Todo and InProgress alike', () => {
      expect(describeDue(at(-DAY), 'Todo', NOW).kind).toBe('overdue');
      expect(describeDue(at(-DAY), 'InProgress', NOW).kind).toBe('overdue');
    });
  });

  describe('due soon (within 48 hours)', () => {
    it.each([
      [0, 'Còn 1 phút'],
      [30 * MIN, 'Còn 30 phút'],
      [59 * MIN + 30_000, 'Còn 59 phút'],
      [HOUR, 'Còn 1 giờ'],
      [23 * HOUR, 'Còn 23 giờ'],
      [DAY, 'Còn 1 ngày'],
      [2 * DAY, 'Còn 2 ngày'],
    ])('%i ms from now reads "%s"', (offset, text) => {
      expect(describeDue(at(offset), 'Todo', NOW)).toMatchObject({ kind: 'soon', text });
    });

    it('one second beyond 48 hours is just a normal date', () => {
      const result = describeDue(at(2 * DAY + 1_000), 'Todo', NOW);

      expect(result.kind).toBe('normal');
      expect(result.text).toMatch(/^Hạn 1[45]\/11\/2026/);
    });
  });

  it('far-future tasks show their date', () => {
    expect(describeDue(new Date(2027, 2, 1, 17, 30).toISOString(), 'Todo', NOW)).toMatchObject({ kind: 'normal', text: 'Hạn 01/03/2027 17:30' });
  });

  it('always provides a full date for the tooltip', () => {
    expect(describeDue(new Date(2026, 10, 20, 17, 30).toISOString(), 'Todo', NOW).title).toBe('Hạn hoàn thành: 20/11/2026 17:30');
    expect(describeDue(null, 'Todo', NOW).title).toBe('Chưa đặt hạn hoàn thành');
  });
});
