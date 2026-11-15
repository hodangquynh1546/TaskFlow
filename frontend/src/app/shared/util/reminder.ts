import { Task, TaskPriority } from '../models/task.models';

/**
 * How long before a task starts it is announced, by priority. There is nothing to choose: low priority is not
 * announced at all, medium five minutes ahead, high a quarter of an hour ahead.
 */
export const REMINDER_LEAD_MINUTES: Readonly<Record<TaskPriority, number | null>> = {
  Low: null,
  Medium: 5,
  High: 15,
};

/** A reminder still goes out up to this long after the start, so one missed while the app was closed is not lost for good. */
export const REMINDER_GRACE_MINUTES = 10;

/** How far ahead of now a check needs to look: the longest lead there is. */
export const REMINDER_LOOKAHEAD_MINUTES = Math.max(...Object.values(REMINDER_LEAD_MINUTES).map((m) => m ?? 0));

const MINUTE = 60_000;

/** Identifies one reminder: the same task moved to another time is a new reminder. */
export const reminderKey = (task: Pick<Task, 'id' | 'startDate'>): string => `${task.id}|${task.startDate}`;

/** When this task should be announced, or null: finished or started tasks, tasks with no start time, and low priority are not. */
export function reminderTime(task: Pick<Task, 'status' | 'priority' | 'startDate'>): Date | null {
  const lead = REMINDER_LEAD_MINUTES[task.priority];
  if (task.status !== 'Todo' || task.startDate === null || lead === null) {
    return null;
  }
  return new Date(new Date(task.startDate).getTime() - lead * MINUTE);
}

/** The tasks to announce right now: their time has come, they have not started long ago, and they were not announced before. */
export function dueReminders<T extends Pick<Task, 'id' | 'status' | 'priority' | 'startDate'>>(tasks: readonly T[], now: Date, done: ReadonlySet<string>): T[] {
  return tasks.filter((task) => {
    const at = reminderTime(task);
    return at !== null && at <= now && now.getTime() <= new Date(task.startDate!).getTime() + REMINDER_GRACE_MINUTES * MINUTE && !done.has(reminderKey(task));
  });
}
