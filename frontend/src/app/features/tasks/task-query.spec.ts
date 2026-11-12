import { convertToParamMap } from '@angular/router';

import {
  DEFAULT_QUERY,
  TaskListQuery,
  clearFilters,
  formatDay,
  hasActiveFilters,
  parseDay,
  parseTaskQuery,
  toQueryParams,
} from './task-query';

const parse = (params: Record<string, string>) => parseTaskQuery(convertToParamMap(params));

describe('parseTaskQuery', () => {
  it('an empty URL gives the defaults', () => {
    expect(parse({})).toEqual(DEFAULT_QUERY);
  });

  it('accepts sorting by start time', () => {
    expect(parse({ sortBy: 'startDate' }).sortBy).toBe('startDate');
  });

  it('reads every supported parameter', () => {
    expect(
      parse({ search: 'báo cáo', status: 'InProgress', priority: 'High', dueFrom: '2026-11-01', dueTo: '2026-11-30', overdue: 'true', sortBy: 'dueDate', sortDir: 'asc', page: '3', pageSize: '20' }),
    ).toEqual({
      search: 'báo cáo', status: 'InProgress', priority: 'High', dueFrom: '2026-11-01', dueTo: '2026-11-30',
      overdue: true, sortBy: 'dueDate', sortDir: 'asc', page: 3, pageSize: 20,
    });
  });

  it.each([
    [{ status: 'Done' }, 'status'],
    [{ priority: 'Urgent' }, 'priority'],
    [{ sortBy: 'title' }, 'sortBy'],
    [{ sortDir: 'up' }, 'sortDir'],
    [{ page: '0' }, 'page'],
    [{ page: '-2' }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ pageSize: '7' }, 'pageSize'],
    [{ pageSize: '500' }, 'pageSize'],
    [{ overdue: 'yes' }, 'overdue'],
    [{ dueFrom: 'yesterday' }, 'dueFrom'],
    [{ dueFrom: '2026-02-30' }, 'dueFrom'],
    [{ dueTo: '2026-13-01' }, 'dueTo'],
  ] as [Record<string, string>, keyof TaskListQuery][])('falls back to the default for the invalid %j', (params, key) => {
    expect(parse(params)[key]).toEqual(DEFAULT_QUERY[key]);
  });

  it('drops an inverted date range instead of sending the server something it will reject', () => {
    const q = parse({ dueFrom: '2026-11-30', dueTo: '2026-11-01' });

    expect(q.dueFrom).toBe('2026-11-30');
    expect(q.dueTo).toBeNull();
  });

  it('keeps an equal date range', () => {
    expect(parse({ dueFrom: '2026-11-12', dueTo: '2026-11-12' })).toMatchObject({ dueFrom: '2026-11-12', dueTo: '2026-11-12' });
  });

  it('caps an absurd page number and an overlong search', () => {
    expect(parse({ page: '999999999' }).page).toBe(100_000);
    expect(parse({ search: 'x'.repeat(500) }).search).toHaveLength(200);
  });
});

describe('toQueryParams', () => {
  it('omits everything that equals the default, so the common URL is just /tasks', () => {
    const params = toQueryParams(DEFAULT_QUERY);

    expect(Object.values(params).every((v) => v === null)).toBe(true);
  });

  it('includes only what differs', () => {
    expect(toQueryParams({ ...DEFAULT_QUERY, status: 'Todo', page: 2, sortDir: 'asc', overdue: true })).toEqual({
      search: null, status: 'Todo', priority: null, dueFrom: null, dueTo: null, overdue: 'true', sortBy: null, sortDir: 'asc', page: '2', pageSize: null,
    });
  });

  it('trims the search and drops a blank one', () => {
    expect(toQueryParams({ ...DEFAULT_QUERY, search: '  báo  ' })['search']).toBe('báo');
    expect(toQueryParams({ ...DEFAULT_QUERY, search: '   ' })['search']).toBeNull();
  });

  it('round-trips: parsing what was written gives the same query back', () => {
    const query: TaskListQuery = {
      search: 'hóa đơn', status: 'Completed', priority: 'Low', dueFrom: '2026-01-05', dueTo: '2026-02-06',
      overdue: true, sortBy: 'priority', sortDir: 'asc', page: 4, pageSize: 50,
    };
    const written = Object.fromEntries(Object.entries(toQueryParams(query)).filter(([, v]) => v !== null)) as Record<string, string>;

    expect(parse(written)).toEqual(query);
  });
});

describe('filters', () => {
  it('sorting and paging alone are not "filters"', () => {
    expect(hasActiveFilters({ ...DEFAULT_QUERY, sortBy: 'dueDate', sortDir: 'asc', page: 3, pageSize: 50 })).toBe(false);
  });

  it.each([
    [{ search: 'x' }],
    [{ status: 'Todo' as const }],
    [{ priority: 'High' as const }],
    [{ dueFrom: '2026-01-01' }],
    [{ dueTo: '2026-01-01' }],
    [{ overdue: true }],
  ])('%j counts as a filter', (patch) => {
    expect(hasActiveFilters({ ...DEFAULT_QUERY, ...patch })).toBe(true);
  });

  it('a whitespace-only search is not a filter', () => {
    expect(hasActiveFilters({ ...DEFAULT_QUERY, search: '   ' })).toBe(false);
  });

  it('clearFilters removes filters and returns to page 1 but keeps sorting and page size', () => {
    const cleared = clearFilters({ ...DEFAULT_QUERY, search: 'x', status: 'Todo', overdue: true, page: 5, sortBy: 'dueDate', sortDir: 'asc', pageSize: 20 });

    expect(cleared).toEqual({ ...DEFAULT_QUERY, page: 1, sortBy: 'dueDate', sortDir: 'asc', pageSize: 20 });
  });
});

describe('day helpers', () => {
  it('formatDay and parseDay are inverses on local calendar days', () => {
    expect(formatDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(formatDay(parseDay('2026-11-12'))).toBe('2026-11-12');
    expect(parseDay('2026-11-12').getHours()).toBe(0);
  });
});
