import { Task } from '../../shared/models/task.models';
import { DEFAULT_BLOCK_MINUTES, layoutDay, snapToQuarter } from './schedule-layout';

let seq = 0;
const task = (h: number, m: number, duration: number | null, patch: Partial<Task> = {}): Task => ({
  id: `t${String(++seq).padStart(3, '0')}`, title: 'x', description: null, status: 'Todo', priority: 'Medium',
  startDate: new Date(2026, 10, 12, h, m).toISOString(), dueDate: null, durationMinutes: duration, isOverdue: false, createdAt: '', updatedAt: '', ...patch,
});
const lanes = (layout: ReturnType<typeof layoutDay>) => layout.blocks.map((b) => [b.startMinute, b.endMinute, b.lane, b.lanes]);

describe('layoutDay', () => {
  it('an empty day has no blocks and the default hours', () => {
    expect(layoutDay([])).toEqual({ blocks: [], startHour: 6, endHour: 22, plannedMinutes: 0, conflicts: 0 });
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
    it('always include 06:00 to 22:00', () => {
      const layout = layoutDay([task(9, 0, 60)]);

      expect([layout.startHour, layout.endHour]).toEqual([6, 22]);
    });

    it('stretch earlier for an early task', () => {
      expect(layoutDay([task(4, 30, 60)]).startHour).toBe(4);
      expect(layoutDay([task(0, 0, 30)]).startHour).toBe(0);
    });

    it('stretch later to cover a late task, rounding up to the next full hour', () => {
      expect(layoutDay([task(21, 0, 150)]).endHour).toBe(24);
      expect(layoutDay([task(22, 10, 20)]).endHour).toBe(23);
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
