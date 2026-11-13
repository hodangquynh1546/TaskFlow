import { TASK_LIST_URL, pageBeforeCreate } from './previous-page';

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
