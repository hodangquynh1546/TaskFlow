import { REMINDER_LOOKAHEAD_MINUTES, dueReminders, reminderKey, reminderTime } from './reminder';

const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m);
const task = (patch: Record<string, unknown> = {}) => ({ id: 't', status: 'Todo' as const, priority: 'Medium' as const, startDate: at(9).toISOString(), ...patch });

describe('reminderTime', () => {
  it.each([
    ['High', 8, 45],
    ['Medium', 8, 55],
  ] as const)('a %s task is announced before it starts', (priority, hour, minute) => {
    expect(reminderTime(task({ priority }))).toEqual(at(hour, minute));
  });

  it('a low priority task is never announced', () => {
    expect(reminderTime(task({ priority: 'Low' }))).toBeNull();
  });

  it.each([['InProgress'], ['Completed']])('a %s task is not announced', (status) => {
    expect(reminderTime(task({ status }))).toBeNull();
  });

  it('a task with no start time has nothing to announce', () => {
    expect(reminderTime(task({ startDate: null }))).toBeNull();
  });

  it('the longest lead is the quarter of an hour of a high priority task', () => {
    expect(REMINDER_LOOKAHEAD_MINUTES).toBe(15);
  });
});

describe('dueReminders', () => {
  it('waits until the time has come', () => {
    expect(dueReminders([task()], at(8, 54), new Set())).toEqual([]);
    expect(dueReminders([task()], at(8, 55), new Set())).toHaveLength(1);
  });

  it('keeps announcing a task until the grace after its start has passed', () => {
    expect(dueReminders([task()], at(9, 10), new Set())).toHaveLength(1);
    expect(dueReminders([task()], at(9, 11), new Set())).toEqual([]);
  });

  it('never announces the same reminder twice', () => {
    const t = task();

    expect(dueReminders([t], at(9, 0), new Set([reminderKey(t)]))).toEqual([]);
  });

  it('moving a task to another time makes a new reminder', () => {
    const before = task();
    const moved = task({ startDate: at(10).toISOString() });

    expect(dueReminders([moved], at(9, 56), new Set([reminderKey(before)]))).toHaveLength(1);
  });

  it('chooses among several: only the ones that are due and not yet announced', () => {
    const due = task({ id: 'a' });
    const later = task({ id: 'b', startDate: at(12).toISOString() });
    const low = task({ id: 'c', priority: 'Low' });
    const done = task({ id: 'd' });

    expect(dueReminders([due, later, low, done], at(9, 0), new Set([reminderKey(done)])).map((t) => t.id)).toEqual(['a']);
  });
});
