import { ParamMap } from '@angular/router';

import { TASK_PRIORITIES, TASK_STATUSES, TaskPriority, TaskStatus } from '../../shared/models/task.models';

export type TaskSortField = 'createdAt' | 'dueDate' | 'priority' | 'startDate';
export type SortDirection = 'asc' | 'desc';

export const SORT_FIELDS: readonly TaskSortField[] = ['createdAt', 'dueDate', 'startDate', 'priority'];
export const PAGE_SIZES: readonly number[] = [10, 20, 50];

/**
 * Everything the task list shows is a function of this object, and this object is a function of the URL.
 * Dates are local calendar days ("2026-11-12"); the service widens them to full-day instants.
 */
export interface TaskListQuery {
  search: string;
  status: TaskStatus | null;
  priority: TaskPriority | null;
  dueFrom: string | null;
  dueTo: string | null;
  overdue: boolean;
  sortBy: TaskSortField;
  sortDir: SortDirection;
  page: number;
  pageSize: number;
}

export const DEFAULT_QUERY: TaskListQuery = {
  search: '',
  status: null,
  priority: null,
  dueFrom: null,
  dueTo: null,
  overdue: false,
  sortBy: 'createdAt',
  sortDir: 'desc',
  page: 1,
  pageSize: 10,
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string | null): string | null {
  if (value === null || !DAY_RE.test(value)) {
    return null;
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? value : null;
}

function positiveInt(value: string | null): number | null {
  return value !== null && /^\d+$/.test(value) && Number(value) >= 1 ? Number(value) : null;
}

/** Reads the URL defensively: anything unrecognised silently falls back to the default instead of erroring. */
export function parseTaskQuery(params: ParamMap): TaskListQuery {
  const status = params.get('status');
  const priority = params.get('priority');
  const sortBy = params.get('sortBy');
  const sortDir = params.get('sortDir');
  const pageSize = positiveInt(params.get('pageSize'));

  const dueFrom = validDay(params.get('dueFrom'));
  let dueTo = validDay(params.get('dueTo'));
  if (dueFrom && dueTo && dueFrom > dueTo) {
    dueTo = null;
  }

  return {
    search: (params.get('search') ?? '').slice(0, 200),
    status: TASK_STATUSES.includes(status as TaskStatus) ? (status as TaskStatus) : null,
    priority: TASK_PRIORITIES.includes(priority as TaskPriority) ? (priority as TaskPriority) : null,
    dueFrom,
    dueTo,
    overdue: params.get('overdue') === 'true',
    sortBy: SORT_FIELDS.includes(sortBy as TaskSortField) ? (sortBy as TaskSortField) : DEFAULT_QUERY.sortBy,
    sortDir: sortDir === 'asc' || sortDir === 'desc' ? sortDir : DEFAULT_QUERY.sortDir,
    page: Math.min(positiveInt(params.get('page')) ?? 1, 100_000),
    pageSize: pageSize !== null && PAGE_SIZES.includes(pageSize) ? pageSize : DEFAULT_QUERY.pageSize,
  };
}

/** The inverse: only values that differ from the defaults appear, so the common URL is just "/tasks". */
export function toQueryParams(query: TaskListQuery): Record<string, string | null> {
  return {
    search: query.search.trim() || null,
    status: query.status,
    priority: query.priority,
    dueFrom: query.dueFrom,
    dueTo: query.dueTo,
    overdue: query.overdue ? 'true' : null,
    sortBy: query.sortBy === DEFAULT_QUERY.sortBy ? null : query.sortBy,
    sortDir: query.sortDir === DEFAULT_QUERY.sortDir ? null : query.sortDir,
    page: query.page > 1 ? String(query.page) : null,
    pageSize: query.pageSize === DEFAULT_QUERY.pageSize ? null : String(query.pageSize),
  };
}

/** Whether any narrowing filter (not sorting or paging) is applied; drives the "clear filters" button and the empty-state wording. */
export function hasActiveFilters(query: TaskListQuery): boolean {
  return Boolean(query.search.trim() || query.status || query.priority || query.dueFrom || query.dueTo || query.overdue);
}

export function clearFilters(query: TaskListQuery): TaskListQuery {
  return { ...query, search: '', status: null, priority: null, dueFrom: null, dueTo: null, overdue: false, page: 1 };
}

/** Local calendar day to/from the "yyyy-MM-dd" form kept in the URL. */
export function formatDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}
