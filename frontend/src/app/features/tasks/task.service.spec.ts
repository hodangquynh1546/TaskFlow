import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DEFAULT_QUERY, TaskListQuery } from './task-query';
import { TaskService, dayBoundary } from './task.service';

function setup() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { service: TestBed.inject(TaskService), http: TestBed.inject(HttpTestingController) };
}

const PAYLOAD = { title: 'Việc', description: null, priority: 'High' as const, status: 'Todo' as const, startDate: null, dueDate: null, durationMinutes: null };

describe('dayBoundary', () => {
  it('start is the first instant of the local day and end is the last', () => {
    expect(new Date(dayBoundary('2026-11-12', 'start'))).toEqual(new Date(2026, 10, 12, 0, 0, 0, 0));
    expect(new Date(dayBoundary('2026-11-12', 'end'))).toEqual(new Date(2026, 10, 12, 23, 59, 59, 999));
  });

  it('returns a UTC instant string the API accepts', () => {
    expect(dayBoundary('2026-11-12', 'start')).toMatch(/Z$/);
  });
});

describe('TaskService', () => {
  describe('list', () => {
    const request = (query: Partial<TaskListQuery>) => {
      const { service, http } = setup();
      service.list({ ...DEFAULT_QUERY, ...query }).subscribe();
      const req = http.expectOne((r) => r.url === '/api/tasks');
      return { req, params: req.request.params };
    };

    it('always sends sorting and paging', () => {
      const { req, params } = request({});

      expect(req.request.method).toBe('GET');
      expect(params.get('sortBy')).toBe('startDate');
      expect(params.get('sortDir')).toBe('asc');
      expect(params.get('page')).toBe('1');
      expect(params.get('pageSize')).toBe('10');
    });

    it('sends nothing for filters that are not set', () => {
      const { params } = request({});

      for (const key of ['search', 'status', 'priority', 'dueFrom', 'dueTo', 'overdue']) {
        expect(params.has(key)).toBe(false);
      }
    });

    it('sends filters that are set, trimming the search', () => {
      const { params } = request({ search: '  báo cáo ', status: 'InProgress', priority: 'High', overdue: true });

      expect(params.get('search')).toBe('báo cáo');
      expect(params.get('status')).toBe('InProgress');
      expect(params.get('priority')).toBe('High');
      expect(params.get('overdue')).toBe('true');
    });

    it('does not send a whitespace-only search', () => {
      expect(request({ search: '   ' }).params.has('search')).toBe(false);
    });

    it('widens a due day range to the whole of both days in local time', () => {
      const { params } = request({ dueFrom: '2026-11-01', dueTo: '2026-11-30' });

      expect(new Date(params.get('dueFrom')!)).toEqual(new Date(2026, 10, 1, 0, 0, 0, 0));
      expect(new Date(params.get('dueTo')!)).toEqual(new Date(2026, 10, 30, 23, 59, 59, 999));
    });

    it('sends only the end of the range when only dueTo is set', () => {
      const { params } = request({ dueTo: '2026-11-30' });

      expect(params.has('dueFrom')).toBe(false);
      expect(params.has('dueTo')).toBe(true);
    });

    it('sends the chosen page, size and order', () => {
      const { params } = request({ page: 3, pageSize: 50, sortBy: 'dueDate', sortDir: 'asc' });

      expect([params.get('page'), params.get('pageSize'), params.get('sortBy'), params.get('sortDir')]).toEqual(['3', '50', 'dueDate', 'asc']);
    });
  });

  describe('the day schedule queries', () => {
    it('forDay asks for tasks starting between the first and last instant of that local day, earliest first', () => {
      const { service, http } = setup();

      service.forDay('2026-11-12').subscribe();
      const params = http.expectOne((r) => r.url === '/api/tasks').request.params;

      expect(new Date(params.get('startFrom')!)).toEqual(new Date(2026, 10, 12, 0, 0, 0, 0));
      expect(new Date(params.get('startTo')!)).toEqual(new Date(2026, 10, 12, 23, 59, 59, 999));
      expect([params.get('sortBy'), params.get('sortDir'), params.get('page'), params.get('pageSize')]).toEqual(['startDate', 'asc', '1', '50']);
    });

    it('dueOn asks for tasks whose deadline falls on that local day', () => {
      const { service, http } = setup();

      service.dueOn('2026-11-12').subscribe();
      const params = http.expectOne((r) => r.url === '/api/tasks').request.params;

      expect(new Date(params.get('dueFrom')!)).toEqual(new Date(2026, 10, 12, 0, 0, 0, 0));
      expect(new Date(params.get('dueTo')!)).toEqual(new Date(2026, 10, 12, 23, 59, 59, 999));
      expect(params.get('sortBy')).toBe('dueDate');
    });
  });

  it('get, create, update, status change and delete use the documented endpoints', () => {
    const { service, http } = setup();

    service.get('a b').subscribe();
    expect(http.expectOne('/api/tasks/a%20b').request.method).toBe('GET');

    service.create(PAYLOAD).subscribe();
    const create = http.expectOne('/api/tasks');
    expect([create.request.method, create.request.body]).toEqual(['POST', PAYLOAD]);

    service.update('1', PAYLOAD).subscribe();
    const update = http.expectOne('/api/tasks/1');
    expect([update.request.method, update.request.body]).toEqual(['PUT', PAYLOAD]);

    service.changeStatus('1', 'Completed').subscribe();
    const patch = http.expectOne('/api/tasks/1/status');
    expect([patch.request.method, patch.request.body]).toEqual(['PATCH', { status: 'Completed' }]);

    service.delete('1').subscribe();
    expect(http.expectOne('/api/tasks/1').request.method).toBe('DELETE');
  });

  it('an id is encoded so it cannot change the path', () => {
    const { service, http } = setup();

    service.get('../auth/me').subscribe();

    http.expectOne('/api/tasks/..%2Fauth%2Fme');
  });
});
