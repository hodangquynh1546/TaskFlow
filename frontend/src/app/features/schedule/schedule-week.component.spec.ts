import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';

import { ApiError } from '../../core/http/api-error';
import { PagedResult, Task } from '../../shared/models/task.models';
import { formatDay } from '../tasks/task-query';
import { UI_TEST_PROVIDERS, aTask } from '../tasks/test-support';
import { TaskService } from '../tasks/task.service';
import { ScheduleComponent } from './schedule.component';

// "Today" is Friday 20 Nov 2026, so the week on screen by default is Monday 16 to Sunday 22.
// 12 Nov 2026 is a Thursday: its week is Monday 9 to Sunday 15.
const paged = (items: Task[], totalCount = items.length): PagedResult<Task> => ({ items, page: 1, pageSize: 50, totalCount, totalPages: 1 });
const on = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).toISOString();
const task = (id: string, day: number, h: number, m: number, duration: number | null, patch: Partial<Task> = {}) =>
  aTask({ id, title: `Việc ${id}`, startDate: on(day, h, m), durationMinutes: duration, ...patch });

async function setup(url: string, tasks: Task[] = [], configure?: (service: { forDay: ReturnType<typeof vi.fn> }) => void) {
  const service = {
    forDay: vi.fn((day: string) => of(paged(tasks.filter((t) => t.startDate !== null && formatDay(new Date(t.startDate)) === day)))),
  };
  configure?.(service);
  TestBed.configureTestingModule({
    providers: [
      ...UI_TEST_PROVIDERS,
      provideRouter([{ path: 'schedule', component: ScheduleComponent }, { path: 'tasks/new', component: ScheduleComponent }], withComponentInputBinding()),
      { provide: TaskService, useValue: service },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, ScheduleComponent);
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await settle();
  const el = harness.routeNativeElement as HTMLElement;
  return { harness, service, el, router: TestBed.inject(Router), settle };
}

const columns = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('.week__col')];
const blocksIn = (col: HTMLElement) => [...col.querySelectorAll<HTMLElement>('a.block')];
const button = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label || b.getAttribute('aria-label') === label)!;

describe('ScheduleComponent, week view', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  describe('which week is shown', () => {
    it('asks for each of the seven days, Monday first', async () => {
      const { service } = await setup('/schedule?view=week&date=2026-11-12');

      expect(service.forDay.mock.calls.map(([d]) => d)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    });

    it('a Sunday belongs to the week that ends on it', async () => {
      const { service } = await setup('/schedule?view=week&date=2026-11-15');

      expect(service.forDay.mock.calls[0][0]).toBe('2026-11-09');
      expect(service.forDay.mock.calls[6][0]).toBe('2026-11-15');
    });

    it('opens on the week of today when there is no date', async () => {
      const { service } = await setup('/schedule?view=week');

      expect(service.forDay.mock.calls[0][0]).toBe('2026-11-16');
    });

    it('any other value of "view" is the ordinary day planner', async () => {
      const { service, el } = await setup('/schedule?view=month&date=2026-11-12');

      expect(el.querySelector('tf-week-grid')).toBeNull();
      expect(el.querySelector('.timeline')).not.toBeNull();
    });

    it('names the week in the summary line', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12');

      expect(el.querySelector('.summary__range')!.textContent).toContain('9/11');
      expect(el.querySelector('.summary__range')!.textContent).toContain('15/11/2026');
    });
  });

  describe('the grid', () => {
    it('has seven columns, Monday to Sunday, each named for screen readers', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12');

      expect(columns(el)).toHaveLength(7);
      expect(columns(el)[0].getAttribute('aria-label')).toMatch(/thứ hai/i);
      expect(columns(el)[6].getAttribute('aria-label')).toMatch(/chủ nhật/i);
    });

    it('puts every task in the column of the day it starts on', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [task('mon', 9, 9, 0, 60), task('thu', 12, 14, 0, 30), task('sun', 15, 20, 0, 60)]);
      const titles = columns(el).map((c) => blocksIn(c).map((b) => b.querySelector('.block__title')!.textContent));

      expect(titles).toEqual([['Việc mon'], [], [], ['Việc thu'], [], [], ['Việc sun']]);
    });

    it('uses the same height and position as the day planner for the same task', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [task('a', 12, 9, 0, 60)]);
      const [a] = blocksIn(columns(el)[3]);

      expect(a.style.top).toBe(`${540 * 1.4}px`);
      expect(a.style.height).toBe(`${60 * 1.4}px`);
    });

    it('overlapping tasks share a column only when they are on the same day', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [task('a', 10, 9, 0, 60), task('b', 11, 9, 0, 60), task('c', 11, 9, 30, 60)]);

      expect(blocksIn(columns(el)[1]).map((b) => b.style.width)).toEqual(['100%']);
      expect(blocksIn(columns(el)[2]).map((b) => b.style.width)).toEqual(['50%', '50%']);
    });

    it('marks today with aria-current and draws the "now" line only in that column', async () => {
      const { el } = await setup('/schedule?view=week');
      const heads = [...el.querySelectorAll('.week__head')];

      expect(heads.map((h) => h.getAttribute('aria-current'))).toEqual([null, null, null, null, 'date', null, null]);
      expect(el.querySelectorAll('.now')).toHaveLength(1);
      expect(columns(el)[4].querySelector('.now')).not.toBeNull();
    });

    it('has no "now" line in a week that does not contain today', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12');

      expect(el.querySelector('.now')).toBeNull();
    });

    it('describes each block with title, times, length and status', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [task('a', 12, 9, 0, 90, { status: 'InProgress' })]);
      const [a] = blocksIn(columns(el)[3]);

      expect(a.getAttribute('aria-label')).toBe('Việc a, 09:00 đến 10:30, 1 giờ 30 phút, Đang làm');
      expect(a.getAttribute('href')).toBe('/tasks/a');
    });

    it('labels every hour of the day on the shared axis', async () => {
      const { el } = await setup('/schedule?view=week');
      const labels = [...el.querySelectorAll('.axis__label')].map((l) => l.textContent);

      expect(labels[0]).toBe('00:00');
      expect(labels[23]).toBe('23:00');
      expect(labels).toHaveLength(24);
    });
  });

  describe('summary and limits', () => {
    it('says when nothing is scheduled that week', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12');

      expect(el.querySelector('.summary')!.textContent).toContain('Chưa có việc nào được xếp giờ trong tuần này.');
    });

    it('adds up the whole week and counts overlaps across all days', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [task('a', 9, 9, 0, 60), task('b', 10, 9, 0, 60), task('c', 10, 9, 30, 30)]);
      const text = el.querySelector('.summary')!.textContent!;

      expect(text).toContain('Đã xếp 2 giờ 30 phút cho 3 việc.');
      expect(text).toContain('2 việc trùng giờ với việc khác.');
    });

    it('says when a day has more than 50 tasks and only the first are shown', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [], (service) =>
        service.forDay.mockImplementation((day: string) => of(paged(day === '2026-11-12' ? [task('a', 12, 9, 0, 60)] : [], day === '2026-11-12' ? 80 : 0))));

      expect(el.querySelector('.note')!.textContent).toContain('hơn 50 việc');
    });

    it('shows a failure with a retry when any day cannot be loaded', async () => {
      const { el } = await setup('/schedule?view=week&date=2026-11-12', [], (service) =>
        service.forDay.mockImplementation((day: string) => (day === '2026-11-14' ? throwError(() => new ApiError(500, 'Máy chủ lỗi.')) : of(paged([])))));

      expect(el.querySelector('tf-error-state')).not.toBeNull();
    });
  });

  describe('moving between weeks and views', () => {
    it('the next and previous buttons move a whole week and say so', async () => {
      const { el, router, service, settle } = await setup('/schedule?view=week&date=2026-11-12');

      button(el, 'Tuần sau').click();
      await settle();
      expect(router.url).toBe('/schedule?view=week&date=2026-11-19');
      expect(service.forDay).toHaveBeenLastCalledWith('2026-11-22');

      button(el, 'Tuần trước').click();
      await settle();
      button(el, 'Tuần trước').click();
      await settle();
      expect(router.url).toBe('/schedule?view=week&date=2026-11-05');
    });

    it('does not reload when the date only moves inside the same week', async () => {
      const { router, service, settle } = await setup('/schedule?view=week&date=2026-11-12');
      const before = service.forDay.mock.calls.length;

      await router.navigate([], { queryParams: { date: '2026-11-14' }, queryParamsHandling: 'merge' });
      await settle();

      expect(service.forDay.mock.calls.length).toBe(before);
    });

    it('"Hôm nay" is disabled while the week of today is shown, and brings it back otherwise', async () => {
      const { el, router, settle } = await setup('/schedule?view=week&date=2026-11-18');
      expect(button(el, 'Hôm nay').disabled).toBe(true);

      button(el, 'Tuần sau').click();
      await settle();
      expect(button(el, 'Hôm nay').disabled).toBe(false);

      button(el, 'Hôm nay').click();
      await settle();
      expect(router.url).toBe('/schedule?view=week');
    });

    it('the Day and Week buttons switch the view, keep the date, and show which one is on', async () => {
      const { el, router, settle } = await setup('/schedule?date=2026-11-12');
      expect(button(el, 'Ngày').getAttribute('aria-pressed')).toBe('true');
      expect(button(el, 'Tuần').getAttribute('aria-pressed')).toBe('false');

      button(el, 'Tuần').click();
      await settle();
      expect(router.url).toBe('/schedule?date=2026-11-12&view=week');
      expect(el.querySelector('tf-week-grid')).not.toBeNull();
      expect(button(el, 'Tuần').getAttribute('aria-pressed')).toBe('true');

      button(el, 'Ngày').click();
      await settle();
      expect(router.url).toBe('/schedule?date=2026-11-12');
      expect(el.querySelector('.timeline')).not.toBeNull();
    });
  });

  describe('starting a task from the grid', () => {
    it('clicking a free hour in a column opens the form on that column\'s day at that hour', async () => {
      const { el, router, settle } = await setup('/schedule?view=week&date=2026-11-12');
      const tuesday = columns(el)[1];
      const slot = [...tuesday.querySelectorAll<HTMLElement>('.hour')][14].querySelector<HTMLButtonElement>('.hour__slot')!;

      slot.click();
      await settle();

      expect(router.url).toBe('/tasks/new?date=2026-11-10&time=14:00');
    });

    it('the slot buttons are out of the tab order and hidden from assistive technology', async () => {
      const { el } = await setup('/schedule?view=week');
      const slots = [...el.querySelectorAll('.hour__slot')];

      expect(slots).toHaveLength(7 * 24);
      expect(slots.every((s) => s.getAttribute('tabindex') === '-1' && s.getAttribute('aria-hidden') === 'true')).toBe(true);
    });
  });

  describe('pointing at a just-saved task', () => {
    it('lights the block in its column and removes the request from the address', async () => {
      const tasks = [task('a', 10, 9, 0, 60), task('b', 13, 15, 0, 60)];
      const { el, router, service, settle } = await setup('/schedule?view=week&date=2026-11-12&highlight=b', tasks);
      await vi.waitFor(() => expect(router.url).toBe('/schedule?view=week&date=2026-11-12'));
      await settle();

      const lit = [...el.querySelectorAll('a.block--flash')];
      expect(lit).toHaveLength(1);
      expect(lit[0].textContent).toContain('Việc b');
      expect(service.forDay.mock.calls.length).toBe(7); // removing the request did not reload the week
    });

    it('a task that is not in this week lights nothing, and the request is still removed', async () => {
      const { el, router, settle } = await setup('/schedule?view=week&date=2026-11-12&highlight=nope', [task('a', 10, 9, 0, 60)]);
      await vi.waitFor(() => expect(router.url).toBe('/schedule?view=week&date=2026-11-12'));
      await settle();

      expect(el.querySelectorAll('a.block--flash')).toHaveLength(0);
    });
  });
});
