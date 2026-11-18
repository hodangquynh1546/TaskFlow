import { Browse } from '../../../core/navigation/browse-memory';
import { TASK_LIST_URL, pageBeforeCreate, whereAfterDelete, whereAfterSave } from './previous-page';

describe('pageBeforeCreate', () => {
  it.each([
    ['/dashboard'],
    ['/schedule?date=2026-11-12'],
    ['/tasks?status=Todo&page=2'],
    ['/tasks/42'],
    ['/profile'],
  ])('returns to %s', (url) => {
    expect(pageBeforeCreate(url)).toBe(url);
  });

  it.each([[undefined], [null], [''], ['/'], ['/tasks/new'], ['/tasks/new?date=2026-11-12'], ['/login'], ['/login?reason=expired'], ['/register']])(
    'falls back to the task list when the earlier page was %j',
    (url) => {
      expect(pageBeforeCreate(url)).toBe(TASK_LIST_URL);
    },
  );

  it.each([['https://evil.example/x'], ['//evil.example'], ['javascript:alert(1)'], ['/a\\b']])('never leaves the app: %s', (url) => {
    expect(pageBeforeCreate(url)).toBe(TASK_LIST_URL);
  });
});

describe('whereAfterSave', () => {
  const OTHER: Browse = { kind: 'other' };
  const task = (patch: Partial<{ id: string; startDate: string | null }> = {}) => ({ id: 'abc', startDate: null, ...patch });
  const LOCAL_NOON = new Date(2026, 10, 14, 12, 0).toISOString();

  describe('from the task list', () => {
    it('returns to the list asking for the task, keeping the sort and filters but not the page', () => {
      expect(whereAfterSave('/tasks?status=InProgress&sortBy=priority&page=3', OTHER, task())).toBe('/tasks?status=InProgress&sortBy=priority&highlight=abc');
    });

    it('replaces an earlier highlight instead of stacking another', () => {
      expect(whereAfterSave('/tasks?highlight=old', OTHER, task({ id: 'new' }))).toBe('/tasks?highlight=new');
    });
  });

  describe('through a task page (detail or edit), the memory says where the user was', () => {
    it('a filtered list is restored, so editing a task does not lose the filter', () => {
      const memory: Browse = { kind: 'list', url: '/tasks?status=InProgress' };

      expect(whereAfterSave('/tasks/42', memory, task({ id: '42' }))).toBe('/tasks?status=InProgress&highlight=42');
      expect(whereAfterSave('/tasks/42/edit', memory, task({ id: '42' }))).toBe('/tasks?status=InProgress&highlight=42');
    });

    it('the planner is restored', () => {
      const memory: Browse = { kind: 'schedule', url: '/schedule?date=2026-11-12' };

      expect(whereAfterSave('/tasks/42', memory, task({ id: '42', startDate: new Date(2026, 10, 12, 9, 0).toISOString() }))).toBe('/schedule?date=2026-11-12&highlight=42');
    });
  });

  describe('from the week planner', () => {
    it('stays in the week view, on the week of the day the task starts, asking for its block', () => {
      expect(whereAfterSave('/schedule?view=week&date=2026-11-12', OTHER, task({ startDate: LOCAL_NOON }))).toBe('/schedule?view=week&date=2026-11-14&highlight=abc');
    });

    it('through a task page, the remembered week view is restored', () => {
      const memory: Browse = { kind: 'schedule', url: '/schedule?view=week&date=2026-11-12' };

      expect(whereAfterSave('/tasks/42/edit', memory, task({ id: '42', startDate: LOCAL_NOON }))).toBe('/schedule?view=week&date=2026-11-14&highlight=42');
    });

    it('a task with no start time stays on the week the user was looking at', () => {
      expect(whereAfterSave('/schedule?view=week&date=2026-11-12', OTHER, task())).toBe('/schedule?view=week&date=2026-11-12&highlight=abc');
    });

    it('an explicit day view stays the day view (the remembered view would otherwise apply)', () => {
      expect(whereAfterSave('/schedule?view=day&date=2026-11-12', OTHER, task({ startDate: LOCAL_NOON }))).toBe('/schedule?view=day&date=2026-11-14&highlight=abc');
    });
  });

  describe('from the day planner', () => {
    it('returns to the planner on the day the task starts, asking for its block', () => {
      expect(whereAfterSave('/schedule?date=2026-11-12', OTHER, task({ startDate: LOCAL_NOON }))).toBe('/schedule?date=2026-11-14&highlight=abc');
    });

    it('a task with no start time stays on the day the user was looking at', () => {
      expect(whereAfterSave('/schedule?date=2026-11-12', OTHER, task())).toBe('/schedule?date=2026-11-12&highlight=abc');
    });

    it('with no day in the address (today) and no start time, just asks for the task', () => {
      expect(whereAfterSave('/schedule', OTHER, task())).toBe('/schedule?highlight=abc');
    });
  });

  describe('from anywhere else', () => {
    it.each([['/dashboard'], ['/profile']])('from %s it returns to that page, ignoring an older list in the memory', (url) => {
      const staleMemory: Browse = { kind: 'list', url: '/tasks?status=Completed' };

      expect(whereAfterSave(url, staleMemory, task())).toBe(url);
    });

    it('through a task page from the overview, the memory leads back to the overview', () => {
      expect(whereAfterSave('/tasks/abc', { kind: 'page', url: '/dashboard' }, task())).toBe('/dashboard');
    });

    it('from an unknown page the task list opens on the task, without filters', () => {
      expect(whereAfterSave('/nowhere', { kind: 'list', url: '/tasks?status=Completed' }, task())).toBe('/tasks?highlight=abc');
    });

    it('with no earlier page and nothing remembered, the task list', () => {
      expect(whereAfterSave(undefined, OTHER, task())).toBe('/tasks?highlight=abc');
    });
  });
});

describe('whereAfterDelete', () => {
  const NOON = new Date(2026, 10, 14, 12, 0).toISOString();

  it('returns to the planner in the same view, on the day the deleted task was on', () => {
    expect(whereAfterDelete({ kind: 'schedule', url: '/schedule?view=week&date=2026-11-12' }, { startDate: NOON })).toBe('/schedule?view=week&date=2026-11-14');
    expect(whereAfterDelete({ kind: 'schedule', url: '/schedule?date=2026-11-12' }, { startDate: NOON })).toBe('/schedule?date=2026-11-14');
  });

  it('a task with no start time returns to the day or week that was on screen', () => {
    expect(whereAfterDelete({ kind: 'schedule', url: '/schedule?view=week&date=2026-11-12' }, { startDate: null })).toBe('/schedule?view=week&date=2026-11-12');
    expect(whereAfterDelete({ kind: 'schedule', url: '/schedule' }, { startDate: null })).toBe('/schedule');
  });

  it.each([
    [{ kind: 'list', url: '/tasks?status=Todo' }, '/tasks?status=Todo'],
    [{ kind: 'page', url: '/dashboard' }, '/dashboard'],
    [{ kind: 'other' }, '/tasks'],
  ] as const)('from %j it is simply the page the task was opened from', (memory, url) => {
    expect(whereAfterDelete(memory, { startDate: NOON })).toBe(url);
  });
});
