import { Task } from '../../shared/models/task.models';

/** What a task with a start time but no length is drawn as: the smallest block that is still readable. */
export const DEFAULT_BLOCK_MINUTES = 30;
export const MIN_DRAWN_MINUTES = 15;

export interface ScheduledBlock {
  task: Task;
  /** Minutes since 00:00 local, for the start and end of the drawn block. */
  startMinute: number;
  endMinute: number;
  /** True when the task has no length of its own and the default was used. */
  estimated: boolean;
  /** Side-by-side lane inside a group of overlapping blocks, and how many lanes that group has. */
  lane: number;
  lanes: number;
}

export interface DayLayout {
  blocks: ScheduledBlock[];
  /** Hours shown on the axis, inclusive start and exclusive end. */
  startHour: number;
  endHour: number;
  /** Total planned minutes of tasks that have a length, and how many tasks overlap another. */
  plannedMinutes: number;
  conflicts: number;
}

export const DEFAULT_START_HOUR = 6;
export const DEFAULT_END_HOUR = 22;

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Places a day's tasks on the timeline.
 * Overlapping blocks share their space in lanes (like any calendar), so none is hidden behind another.
 * The visible hours always include 06:00–22:00 and stretch to cover tasks outside that window.
 */
export function layoutDay(tasks: readonly Task[]): DayLayout {
  const items = tasks
    .filter((t) => t.startDate !== null)
    .map((task) => {
      const start = new Date(task.startDate!);
      const startMinute = minuteOfDay(start);
      const estimated = task.durationMinutes === null;
      const length = Math.max(task.durationMinutes ?? DEFAULT_BLOCK_MINUTES, MIN_DRAWN_MINUTES);
      // A block that would run past midnight is clipped to the end of the day.
      return { task, startMinute, endMinute: Math.min(startMinute + length, 24 * 60), estimated };
    })
    .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.task.id.localeCompare(b.task.id));

  // Group blocks into clusters of transitively overlapping ones, then give each block the first free lane.
  const blocks: ScheduledBlock[] = [];
  let cluster: ScheduledBlock[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    for (const block of cluster) {
      block.lanes = laneEnds.length;
    }
    blocks.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const item of items) {
    if (cluster.length > 0 && item.startMinute >= clusterEnd) {
      closeCluster();
    }
    let lane = laneEnds.findIndex((end) => end <= item.startMinute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMinute);
    } else {
      laneEnds[lane] = item.endMinute;
    }
    cluster.push({ ...item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.endMinute);
  }
  closeCluster();

  const earliest = blocks.length ? Math.min(...blocks.map((b) => b.startMinute)) : Infinity;
  const latest = blocks.length ? Math.max(...blocks.map((b) => b.endMinute)) : -Infinity;

  return {
    blocks,
    startHour: Math.min(DEFAULT_START_HOUR, Math.floor(earliest / 60)),
    endHour: Math.max(DEFAULT_END_HOUR, Math.ceil(latest / 60)),
    plannedMinutes: tasks.reduce((sum, t) => sum + (t.startDate !== null ? (t.durationMinutes ?? 0) : 0), 0),
    conflicts: blocks.filter((b) => b.lanes > 1).length,
  };
}

/** Snaps a minute-of-day to a 15 minute grid, for placing a new task where the user clicked. */
export function snapToQuarter(minute: number): number {
  return Math.max(0, Math.min(24 * 60 - 15, Math.round(minute / 15) * 15));
}
