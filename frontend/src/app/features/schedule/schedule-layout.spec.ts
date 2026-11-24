import { Task } from '../../shared/models/task.models';
import { DEFAULT_BLOCK_MINUTES, DRAG_STEP_MINUTES, movedStart, HOUR_HEIGHT, MAX_HOUR_HEIGHT, fitHourHeight, layoutDay, layoutWeek, snapToQuarter, startOfWeek, weekDays } from './schedule-layout';

let seq = 0;
const task = (h: number, m: number, duration: number | null, patch: Partial<Task> = {}): Task => ({
  id: `t${String(++seq).padStart(3, '0')}`, title: 'x', description: null, status: 'Todo', priority: 'Medium',
  startDate: new Date(2026, 10, 12, h, m).toISOString(), dueDate: null, durationMinutes: duration, isOverdue: false, createdAt: '', updatedAt: '', ...patch,
});
const lanes = (layout: ReturnType<typeof layoutDay>) => layout.blocks.map((b) => [b.startMinute, b.endMinute, b.lane, b.lanes]);

describe('layoutDay', () => {
  it('an empty day has no blocks and the default hours', () => {
    expect(layoutDay([])).toEqual({ blocks: [], startHour: 0, endHour: 24, plannedMinutes: 0, conflicts: 0 });
  });

  it('places a block by minute of the day', () => {
    const layout = layoutDay([task(9, 30, 60)]);

    expect(lanes(layout)).toEqual([[570, 630, 0, 1]]);
  });

  it('blocks that do not overlap each get the full width', () => {
    const layout = layoutDay([task(9, 0, 60), task(11, 0, 30)]);

    expect(lanes(layout)).toEqual([[540, 600, 0, 1], [660, 690, 0, 1]]);
    expect(layout.conflicts).toBe(0);
  });

  it('back-to-back blocks do not overlap: one ending when the next starts', () => {
    const layout = layoutDay([task(9, 0, 60), task(10, 0, 60)]);

    expect(lanes(layout)).toEqual([[540, 600, 0, 1], [600, 660, 0, 1]]);
    expect(layout.conflicts).toBe(0);
  });

  it('overlapping blocks share the width in lanes', () => {
    const layout = layoutDay([task(9, 0, 120), task(10, 0, 60)]);

    expect(lanes(layout)).toEqual([[540, 660, 0, 2], [600, 660, 1, 2]]);
    expect(layout.conflicts).toBe(2);
  });

  it('three at once need three lanes', () => {
    const layout = layoutDay([task(9, 0, 60), task(9, 15, 60), task(9, 30, 60)]);

    expect(layout.blocks.map((b) => b.lane)).toEqual([0, 1, 2]);
    expect(layout.blocks.every((b) => b.lanes === 3)).toBe(true);
  });

  it('a lane is reused once its block has ended', () => {
    // 9:00-10:00 and 9:30-10:30 overlap; 10:00-11:00 starts when the first ends, so it takes lane 0 again.
    const layout = layoutDay([task(9, 0, 60), task(9, 30, 60), task(10, 0, 60)]);

    expect(layout.blocks.map((b) => b.lane)).toEqual([0, 1, 0]);
    expect(layout.blocks.every((b) => b.lanes === 2)).toBe(true);
  });

  it('separate clusters are sized independently', () => {
    const layout = layoutDay([task(9, 0, 60), task(9, 30, 60), task(14, 0, 60)]);

    expect(layout.blocks.map((b) => b.lanes)).toEqual([2, 2, 1]);
  });

  it('a long block overlapping a later short one chains the cluster', () => {
    const layout = layoutDay([task(9, 0, 240), task(10, 0, 30), task(12, 30, 30)]);

    expect(layout.blocks.map((b) => [b.lane, b.lanes])).toEqual([[0, 2], [1, 2], [1, 2]]);
  });

  it('does not depend on the order the tasks arrive in', () => {
    const a = layoutDay([task(10, 0, 60), task(9, 0, 120)]);
    const b = layoutDay([task(9, 0, 120), task(10, 0, 60)]);

    expect(a.blocks.map((x) => [x.startMinute, x.lane])).toEqual(b.blocks.map((x) => [x.startMinute, x.lane]));
  });

  it('gives identical start times a stable order', () => {
    const t1 = task(9, 0, 60);
    const t2 = task(9, 0, 60);

    const forwards = layoutDay([t1, t2]).blocks.map((b) => b.task.id);
    const backwards = layoutDay([t2, t1]).blocks.map((b) => b.task.id);

    expect(forwards).toEqual(backwards);
  });

  describe('length', () => {
    it('a task with a start but no length is drawn as a default block and marked as an estimate', () => {
      const [block] = layoutDay([task(9, 0, null)]).blocks;

      expect(block.endMinute - block.startMinute).toBe(DEFAULT_BLOCK_MINUTES);
      expect(block.estimated).toBe(true);
    });

    it('a very short task is drawn at least 15 minutes tall so it stays clickable', () => {
      const [block] = layoutDay([task(9, 0, 5)]).blocks;

      expect(block.endMinute - block.startMinute).toBe(15);
      expect(block.estimated).toBe(false);
    });

    it('a block that would pass midnight is clipped to the end of the day', () => {
      const [block] = layoutDay([task(23, 30, 120)]).blocks;

      expect(block.endMinute).toBe(1440);
    });
  });

  describe('visible hours', () => {
    it('are always the whole day, 00:00 to 24:00', () => {
      expect([layoutDay([]).startHour, layoutDay([]).endHour]).toEqual([0, 24]);
      expect([layoutDay([task(9, 0, 60)]).startHour, layoutDay([task(9, 0, 60)]).endHour]).toEqual([0, 24]);
    });

    it('stay the whole day for tasks at the very start and very end of it', () => {
      const early = layoutDay([task(0, 0, 30)]);
      const late = layoutDay([task(23, 0, 60)]);

      expect([early.startHour, early.endHour]).toEqual([0, 24]);
      expect([late.startHour, late.endHour]).toEqual([0, 24]);
    });
  });

  describe('summary figures', () => {
    it('plannedMinutes adds the lengths of scheduled tasks and ignores estimates', () => {
      const layout = layoutDay([task(9, 0, 60), task(11, 0, 90), task(14, 0, null)]);

      expect(layout.plannedMinutes).toBe(150);
    });

    it('a task with a length but no start is not on the timeline and is not counted', () => {
      const layout = layoutDay([task(9, 0, 60), task(9, 0, 120, { startDate: null })]);

      expect(layout.blocks).toHaveLength(1);
      expect(layout.plannedMinutes).toBe(60);
    });

    it('conflicts counts the tasks that overlap another', () => {
      expect(layoutDay([task(9, 0, 60), task(9, 30, 60), task(15, 0, 30)]).conflicts).toBe(2);
    });
  });
});

describe('snapToQuarter', () => {
  it.each([[0, 0], [7, 0], [8, 15], [540, 540], [547, 540], [548, 555], [1439, 1425], [2000, 1425], [-30, 0]])('%i snaps to %i', (minute, expected) => {
    expect(snapToQuarter(minute)).toBe(expected);
  });
});

describe('startOfWeek', () => {
  it.each([
    ['2026-11-16', '2026-11-16'], // Monday stays
    ['2026-11-18', '2026-11-16'],
    ['2026-11-22', '2026-11-16'], // Sunday belongs to the week that began the Monday before
    ['2026-11-23', '2026-11-23'],
    ['2026-01-01', '2025-12-29'], // across a year boundary
    ['2026-03-01', '2026-02-23'], // across a month boundary
  ])('%s is in the week that starts on %s', (day, monday) => {
    expect(startOfWeek(day)).toBe(monday);
  });
});

describe('weekDays', () => {
  it('lists Monday to Sunday', () => {
    expect(weekDays('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  });

  it('crosses a month and a year without skipping or repeating a day', () => {
    expect(weekDays('2026-12-31')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it.each(['2026-03-29', '2026-10-25', '2026-11-01'])('has seven distinct days around a daylight-saving change (%s)', (day) => {
    const days = weekDays(day);

    expect(new Set(days).size).toBe(7);
    expect(days).toEqual([...days].sort());
  });
});

describe('layoutWeek', () => {
  const days = weekDays('2026-11-12');
  const onDay = (d: number, h: number, duration: number | null) => task(h, 0, duration, { startDate: new Date(2026, 10, d, h, 0).toISOString() });

  it('gives one layout per day, in the order of the days', () => {
    const layouts = layoutWeek(days, [onDay(9, 9, 60), onDay(12, 14, 60)]);

    expect(layouts).toHaveLength(7);
    expect(layouts.map((l) => l.blocks.length)).toEqual([1, 0, 0, 1, 0, 0, 0]);
  });

  it('tasks at the same hour on different days do not overlap', () => {
    const layouts = layoutWeek(days, [onDay(9, 9, 60), onDay(10, 9, 60)]);

    expect(layouts.map((l) => l.conflicts)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores tasks without a start time and tasks outside the week', () => {
    const layouts = layoutWeek(days, [task(9, 0, 60, { startDate: null }), onDay(20, 9, 60)]);

    expect(layouts.every((l) => l.blocks.length === 0)).toBe(true);
  });
});

describe('fitHourHeight', () => {
  it('makes the visible rows exactly fill the room that is left', () => {
    // 700px left, 16px of margin above the first line, 8 rows: (700 - 16) / 8 = 85.5
    expect(fitHourHeight(700, 8, 16)).toBe(86);
    expect(fitHourHeight(700 + 8 * 10, 8, 16)).toBe(96);
  });

  it('counts what the week header takes before dividing among the rows', () => {
    expect(fitHourHeight(700, 7, 16 + 56)).toBe(90);
  });

  it('never squeezes the rows below the default on a short window: the page scrolls instead', () => {
    expect(fitHourHeight(300, 8, 16)).toBe(HOUR_HEIGHT);
    expect(fitHourHeight(-50, 8, 16)).toBe(HOUR_HEIGHT);
  });

  it('stops growing on a very tall window', () => {
    expect(fitHourHeight(5000, 8, 16)).toBe(MAX_HOUR_HEIGHT);
  });
});

describe('movedStart', () => {
  const PX = 1.2; // pixels per minute: 15 minutes are 18px
  const at = (h: number, m = 0, day = 12) => new Date(2026, 10, day, h, m);

  it.each([
    [18, 9, 15],
    [36, 9, 30],
    [-36, 8, 30],
    [180, 11, 30],
    [-180, 6, 30],
  ])('dragging %ipx moves a task at 09:00 to %i:%i', (dy, hour, minute) => {
    expect(movedStart(at(9), dy, PX, 0)).toEqual(at(hour, minute));
  });

  it('moves in whole steps from where the task was, so an odd start stays odd', () => {
    expect(movedStart(at(9, 7), 18, PX, 0)).toEqual(at(9, 22));
  });

  it('a drag shorter than half a step changes nothing, and returns the very same instant', () => {
    const start = new Date(2026, 10, 12, 9, 7, 31);

    expect(movedStart(start, 8, PX, 0).getTime()).toBe(start.getTime());
    expect(movedStart(start, -8, PX, 0).getTime()).toBe(start.getTime());
  });

  it('rounds to the nearest step, half a step away from zero, the same up and down', () => {
    expect(movedStart(at(9), 8, PX, 0)).toEqual(at(9, 0)); // 6.7 minutes: under half a step
    expect(movedStart(at(9), 9, PX, 0)).toEqual(at(9, 15)); // 7.5 minutes: exactly half
    expect(movedStart(at(9), -9, PX, 0)).toEqual(at(8, 45));
    expect(movedStart(at(9), -8, PX, 0)).toEqual(at(9, 0));
  });

  it('stays inside the day: nothing before 00:00 and nothing later than the last step', () => {
    expect(movedStart(at(0, 30), -500, PX, 0)).toEqual(at(0, 0));
    expect(movedStart(at(23, 0), 500, PX, 0)).toEqual(at(23, 60 - DRAG_STEP_MINUTES));
  });

  it('carries the day with it, keeping the time when only the day changes', () => {
    expect(movedStart(at(9, 30), 0, PX, 2)).toEqual(at(9, 30, 14));
    expect(movedStart(at(9, 30), 0, PX, -3)).toEqual(at(9, 30, 9));
  });

  it('changes both at once', () => {
    expect(movedStart(at(9), 36, PX, 1)).toEqual(at(9, 30, 13));
  });

  it('crosses a month end without trouble', () => {
    expect(movedStart(new Date(2026, 10, 30, 9, 0), 0, PX, 1)).toEqual(new Date(2026, 11, 1, 9, 0));
  });
});
