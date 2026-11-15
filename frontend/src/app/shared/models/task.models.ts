import { MessageKey } from '../../core/i18n/messages/vi';

/** Mirrors the API contract in docs/api/api-spec.md. Wire values are the English names; labels come from the message dictionaries. */
export type TaskStatus = 'Todo' | 'InProgress' | 'Completed';
export type TaskPriority = 'Low' | 'Medium' | 'High';

export const TASK_STATUSES: readonly TaskStatus[] = ['Todo', 'InProgress', 'Completed'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['Low', 'Medium', 'High'];

export const STATUS_KEYS: Readonly<Record<TaskStatus, MessageKey>> = {
  Todo: 'status.Todo',
  InProgress: 'status.InProgress',
  Completed: 'status.Completed',
};

export const PRIORITY_KEYS: Readonly<Record<TaskPriority, MessageKey>> = {
  Low: 'priority.Low',
  Medium: 'priority.Medium',
  High: 'priority.High',
};

/** 1 to 3 bars in the priority marker. */
export const PRIORITY_LEVEL: Readonly<Record<TaskPriority, 1 | 2 | 3>> = {
  Low: 1,
  Medium: 2,
  High: 3,
};

export type RecurrenceFrequency = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

export const RECURRENCE_FREQUENCIES: readonly RecurrenceFrequency[] = ['Daily', 'Weekly', 'Monthly', 'Yearly'];

/** How a task repeats. `weekdays` is a bit mask, Monday = 1 ... Sunday = 64; 0 means the weekday of the start. */
export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval: number;
  weekdays: number;
  until: string | null;
  /** The user's own UTC offset, so "every Monday at 09:00" means Monday where they are. */
  utcOffsetMinutes: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  /** Planned length in minutes (BR-13); with a start time it is a block of time in a day. */
  durationMinutes: number | null;
  /** Computed by the server (BR-09) so every screen agrees on what "overdue" means. */
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  recurrence?: Recurrence | null;
  /** Only in the answer to finishing a repeating task: the occurrence that was created. */
  next?: { id: string; startDate: string } | null;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** The body of create and update; a null optional field clears it on the server. */
export interface TaskPayload {
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  startDate: string | null;
  dueDate: string | null;
  durationMinutes: number | null;
  recurrence?: Recurrence | null;
}

export interface DashboardSummary {
  total: number;
  todo: number;
  inProgress: number;
  completed: number;
  overdue: number;
}
