import { Task } from '../../shared/models/task.models';
import { formatDay, parseDay } from '../tasks/task-query';

/**
 * Pixels per minute on the timeline: an hour is 72px tall. That is what lets the planner show 8 hours (7 in the week
 * view, which also has a header row) in a window of about 800px without scrolling. The CSS reads it as --hour-h.
 */
export const PX_PER_MINUTE = 1.2;
export const HOUR_HEIGHT = 60 * PX_PER_MINUTE;
/** The tallest an hour grows to on a very tall window; beyond it more rows simply show. */
export const MAX_HOUR_HEIGHT = 120;
/** Hours of the day visible at once, before scrolling. */
export const VISIBLE_HOURS_DAY = 8;
export const VISIBLE_HOURS_WEEK = 7;
/** A block shorter than this has no room for two lines, so its title and time share one row. */
export const SHORT_BLOCK_HEIGHT = 42;

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

/** The whole day, so a task at any hour is on the axis without it stretching. */
export const DEFAULT_START_HOUR = 0;
export const DEFAULT_END_HOUR = 24;

function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * Places a day's tasks on the timeline.
 * Overlapping blocks share their space in lanes (like any calendar), so none is hidden behind another.
 * The axis is always the whole day, 00:00–24:00.
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

/** The Monday on or before a day ("yyyy-MM-dd"): weeks run Monday to Sunday, as in Vietnam, Japan and China. */
export function startOfWeek(day: string): string {
  const date = parseDay(day);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return formatDay(date);
}

/** The seven days, Monday first, of the week that contains `day`. Built by calendar arithmetic so daylight saving never skips or repeats one. */
export function weekDays(day: string): string[] {
  const first = parseDay(startOfWeek(day));
  return Array.from({ length: 7 }, (_, i) => formatDay(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)));
}

/** One layout per day, in the order of `days`: each task goes to the day it starts on (the user's local day). */
export function layoutWeek(days: readonly string[], tasks: readonly Task[]): DayLayout[] {
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.startDate !== null) {
      const key = formatDay(new Date(task.startDate));
      byDay.set(key, [...(byDay.get(key) ?? []), task]);
    }
  }
  return days.map((day) => layoutDay(byDay.get(day) ?? []));
}

/**
 * The hour height that makes `rows` hours exactly fill the room left in the window: `availablePx` is what is
 * left below the top of the planner, `fixedPx` what the panel spends on things that are not hour rows (the margin
 * above the first line, the week header). Never smaller than the default, so a short window scrolls instead of
 * squeezing the rows.
 */
export function fitHourHeight(availablePx: number, rows: number, fixedPx: number): number {
  const fitted = (availablePx - fixedPx) / rows;
  return Math.round(Math.min(MAX_HOUR_HEIGHT, Math.max(HOUR_HEIGHT, fitted)));
}

/** Moving a block by dragging snaps to this many minutes. */
export const DRAG_STEP_MINUTES = 15;

/**
 * Where a task that starts at `start` lands when its block is dragged `dy` pixels down (negative: up) and `dayShift` days
 * to the right. The change is whole steps of `DRAG_STEP_MINUTES` from where it was, so a task at 09:07 moves to 09:22 and
 * not to a round number the user did not ask for, and a drag too short to make a step changes nothing. The time of day
 * stays inside the day (00:00 to the last step), because a block that would run past midnight is not a task of that day.
 */
export function movedStart(start: Date, dy: number, pxPerMinute: number, dayShift: number): Date {
  const exact = dy / pxPerMinute / DRAG_STEP_MINUTES;
  // Half a step rounds away from zero both ways, so dragging up and dragging down feel the same.
  const steps = Math.sign(exact) * Math.round(Math.abs(exact));
  const minute = start.getHours() * 60 + start.getMinutes();
  const moved = Math.min(24 * 60 - DRAG_STEP_MINUTES, Math.max(0, minute + steps * DRAG_STEP_MINUTES));
  // A drag that changes nothing returns the same instant (seconds and all), so the caller can tell nothing moved.
  if (moved === minute && dayShift === 0) {
    return new Date(start);
  }
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayShift, Math.floor(moved / 60), moved % 60);
}
