import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../core/http/api-error';
import { PagedResult, Task } from '../../shared/models/task.models';
import { UI_TEST_PROVIDERS, aTask } from '../tasks/test-support';
import { TaskService } from '../tasks/task.service';
import { PX_PER_MINUTE, ScheduleComponent } from './schedule.component';

const DAY = '2026-11-12';
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const paged = (items: Task[], totalCount = items.length): PagedResult<Task> => ({ items, page: 1, pageSize: 50, totalCount, totalPages: 1 });
const block = (id: string, h: number, m: number, duration: number | null, patch: Partial<Task> = {}) =>
  aTask({ id, title: `Việc ${id}`, startDate: at(h, m), durationMinutes: duration, ...patch });

async function setup(url = `/schedule?date=${DAY}`, scheduled: unknown = of(paged([])), due: unknown = of(paged([]))) {
  const service = { forDay: vi.fn().mockReturnValue(scheduled), dueOn: vi.fn().mockReturnValue(due) };
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
  return { harness, service, el, router: TestBed.inject(Router), settle, text: () => el.textContent ?? '' };
}

async function setupWithComponent(url: string, scheduled: unknown = of(paged([])), due: unknown = of(paged([]))) {
  const service = { forDay: vi.fn().mockReturnValue(scheduled), dueOn: vi.fn().mockReturnValue(due) };
  TestBed.configureTestingModule({
    providers: [
      ...UI_TEST_PROVIDERS,
      provideRouter([{ path: 'schedule', component: ScheduleComponent }], withComponentInputBinding()),
      { provide: TaskService, useValue: service },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, ScheduleComponent);
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { harness: Object.assign(harness, { component }) };
}

const blocks = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('a.block')];

describe('ScheduleComponent', () => {
  // "Today" is pinned so the tests never depend on the date they happen to run on.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  describe('which day is shown', () => {
    it('asks for the day in the URL', async () => {
      const { service } = await setup('/schedule?date=2026-11-12');

      expect(service.forDay).toHaveBeenCalledWith('2026-11-12');
      expect(service.dueOn).toHaveBeenCalledWith('2026-11-12');
    });

    it.each([['abc'], ['2026-02-30'], ['2026-13-01'], ['12/11/2026'], ['']])('falls back to today for the invalid date %j', async (bad) => {
      const { service } = await setup(`/schedule?date=${encodeURIComponent(bad)}`);

      expect(service.forDay).toHaveBeenCalledWith('2026-11-20');
    });

    it('shows today when there is no date at all', async () => {
      const { service, el } = await setup('/schedule');

      expect(service.forDay).toHaveBeenCalledWith('2026-11-20');
      expect(el.querySelector<HTMLButtonElement>('.nav button:not(.nav__step):not(.ant-btn-primary)')!.disabled).toBe(true); // "Hôm nay" is already today
    });
  });

  describe('the timeline', () => {
    it('draws a block at the right height for its time and length', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
      const [a] = blocks(el);

      // 06:00 is the top of the default window, so 09:00 is 180 minutes down.
      expect(a.style.top).toBe(`${180 * PX_PER_MINUTE}px`);
      expect(a.style.height).toBe(`${60 * PX_PER_MINUTE}px`);
      expect(a.style.left).toBe('0%');
      expect(a.style.width).toBe('100%');
    });

    it('prints the title and the time on the block, and links to the task', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 90)])));
      const [a] = blocks(el);

      expect(a.querySelector('.block__title')!.textContent).toBe('Việc a');
      expect(a.querySelector('.block__time')!.textContent).toBe('09:00–10:30');
      expect(a.getAttribute('href')).toBe('/tasks/a');
    });

    it('gives each block an accessible description with title, times, length and status', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 90, { status: 'InProgress' })])));

      expect(blocks(el)[0].getAttribute('aria-label')).toBe('Việc a, 09:00 đến 10:30, 1 giờ 30 phút, Đang làm');
    });

    it('overlapping tasks sit side by side instead of hiding each other', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 120), block('b', 10, 0, 60)])));
      const [a, b] = blocks(el);

      expect([a.style.left, a.style.width]).toEqual(['0%', '50%']);
      expect([b.style.left, b.style.width]).toEqual(['50%', '50%']);
    });

    it('tints blocks by status and marks high priority, never by colour alone (the text is always printed)', async () => {
      const { el } = await setup(undefined, of(paged([
        block('t', 8, 0, 30), block('p', 9, 0, 30, { status: 'InProgress' }), block('c', 10, 0, 30, { status: 'Completed' }), block('h', 11, 0, 30, { priority: 'High' }),
      ])));
      const [t, p, c, h] = blocks(el);

      expect(t.classList.contains('block--Todo')).toBe(true);
      expect(p.classList.contains('block--InProgress')).toBe(true);
      expect(c.classList.contains('block--Completed')).toBe(true);
      expect(h.classList.contains('block--high')).toBe(true);
      expect(blocks(el).every((b) => b.querySelector('.block__title')!.textContent!.length > 0)).toBe(true);
    });

    it('a block too short for two lines puts the title and time on one row so nothing is cut off', async () => {
      const { el } = await setup(undefined, of(paged([block('s', 9, 0, 15), block('l', 11, 0, 60), block('m', 13, 0, 30)])));
      const [short, long, half] = blocks(el);

      expect(short.classList.contains('block--short')).toBe(true);
      expect(long.classList.contains('block--short')).toBe(false);
      expect(half.classList.contains('block--short')).toBe(false); // 30 minutes still fits two lines
    });

    it('a task with a start but no length is drawn as an estimate', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, null)])));

      expect(blocks(el)[0].classList.contains('block--estimated')).toBe(true);
      expect(blocks(el)[0].getAttribute('aria-label')).toContain('chưa có thời lượng');
    });

    it('stretches the hours to show an early task', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 4, 0, 60)])));

      expect(el.querySelector('.hour__label')!.textContent).toBe('04:00');
    });

    it('labels every hour of the default window', async () => {
      const { el } = await setup();

      const labels = [...el.querySelectorAll('.hour__label')].map((l) => l.textContent);
      expect(labels[0]).toBe('06:00');
      expect(labels.at(-1)).toBe('21:00');
      expect(labels).toHaveLength(16);
    });
  });

  describe('summary', () => {
    it('says when nothing is scheduled', async () => {
      const { el } = await setup();

      expect(el.querySelector('.summary')!.textContent).toBe('Chưa có việc nào được xếp giờ trong ngày này.');
    });

    it('adds up the planned time', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 11, 0, 90)])));

      expect(el.querySelector('.summary')!.textContent).toBe('Đã xếp 2 giờ 30 phút cho 2 việc.');
    });

    it('warns how many tasks overlap another', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 9, 30, 60), block('c', 14, 0, 30)])));

      expect(el.querySelector('.summary')!.textContent).toBe('Đã xếp 2 giờ 30 phút cho 3 việc. 2 việc trùng giờ với việc khác.');
    });

    it('counts tasks without a length but does not invent minutes for them', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, null)])));

      expect(el.querySelector('.summary')!.textContent).toBe('1 việc được xếp giờ.');
    });

    it('is announced politely when it changes', async () => {
      expect((await setup()).el.querySelector('.summary')!.getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('due today but not yet placed', () => {
    it('lists open tasks due that day that have no start time', async () => {
      const { el } = await setup(undefined, of(paged([])), of(paged([
        aTask({ id: 'u1', title: 'Chưa xếp', dueDate: at(17) }),
        aTask({ id: 'u2', title: 'Đã xếp rồi', dueDate: at(17), startDate: at(9) }),
        aTask({ id: 'u3', title: 'Đã xong', dueDate: at(17), status: 'Completed' }),
      ])));

      const titles = [...el.querySelectorAll('.unscheduled__item a')].map((a) => a.textContent);
      expect(titles).toEqual(['Chưa xếp']);
      expect(el.querySelector('.unscheduled__item a')!.getAttribute('href')).toBe('/tasks/u1');
    });

    it('says so when there are none', async () => {
      const { el } = await setup();

      expect(el.querySelector('.unscheduled__empty')!.textContent).toBe('Không có việc nào.');
    });
  });

  describe('moving between days', () => {
    it('the next and previous buttons change the date in the URL and reload', async () => {
      const { el, router, service, settle } = await setup();

      el.querySelector<HTMLButtonElement>('button[aria-label="Ngày sau"]')!.click();
      await settle();
      expect(router.url).toBe('/schedule?date=2026-11-13');
      expect(service.forDay).toHaveBeenLastCalledWith('2026-11-13');

      el.querySelector<HTMLButtonElement>('button[aria-label="Ngày trước"]')!.click();
      await settle();
      el.querySelector<HTMLButtonElement>('button[aria-label="Ngày trước"]')!.click();
      await settle();
      expect(router.url).toBe('/schedule?date=2026-11-11');
    });

    it('steps correctly across a month boundary', async () => {
      const { el, router, settle } = await setup('/schedule?date=2026-11-30');

      el.querySelector<HTMLButtonElement>('button[aria-label="Ngày sau"]')!.click();
      await settle();

      expect(router.url).toBe('/schedule?date=2026-12-01');
    });

    it('"Hôm nay" returns to today with a clean URL and is disabled when already there', async () => {
      const { el, router, settle } = await setup();
      const todayButton = [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent!.trim() === 'Hôm nay')!;
      expect(todayButton.disabled).toBe(false);

      todayButton.click();
      await settle();

      expect(router.url).toBe('/schedule');
      expect(todayButton.disabled).toBe(true);
    });

    it('shows a weekday-and-date picker for jumping to any day', async () => {
      const { el } = await setup();

      expect(el.querySelector('nz-date-picker')).not.toBeNull();
      expect(el.querySelector<HTMLInputElement>('nz-date-picker input')!.value).toMatch(/12\/11\/2026/);
    });
  });

  describe('starting a task from the calendar', () => {
    it('clicking a free hour opens the new-task form set to that day and time', async () => {
      const { el, router, settle } = await setup();
      const slot = [...el.querySelectorAll<HTMLButtonElement>('.hour')].find((h) => h.querySelector('.hour__label')!.textContent === '09:00')!.querySelector<HTMLButtonElement>('.hour__slot')!;

      slot.click();
      await settle();

      expect(router.url).toBe('/tasks/new?date=2026-11-12&time=09:00');
    });

    it('"Thêm việc" opens the form on that day with no time', async () => {
      const { el, router, settle } = await setup();

      [...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent!.includes('Thêm việc'))!.click();
      await settle();

      expect(router.url).toBe('/tasks/new?date=2026-11-12');
    });

    it('the slot buttons are out of the tab order and hidden from assistive technology; "Thêm việc" is the keyboard route', async () => {
      const { el } = await setup();
      const slot = el.querySelector('.hour__slot')!;

      expect(slot.getAttribute('tabindex')).toBe('-1');
      expect(slot.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('the "now" line', () => {
    it('shows at the current time, only while looking at today', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 12, 10, 30));

      const today = await setup('/schedule?date=2026-11-12');
      expect((today.el.querySelector<HTMLElement>('.now'))!.style.top).toBe(`${(10 * 60 + 30 - 6 * 60) * PX_PER_MINUTE}px`);
      expect(today.el.querySelector('.now')!.getAttribute('aria-hidden')).toBe('true');
      TestBed.resetTestingModule();

      const other = await setup('/schedule?date=2026-11-13');
      expect(other.el.querySelector('.now')).toBeNull();
    });

    it('is not drawn when the time is outside the visible hours', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 12, 23, 0));

      const { el } = await setup('/schedule?date=2026-11-12');

      expect(el.querySelector('.now')).toBeNull();
    });
  });

  describe('loading, error and limits', () => {
    it('shows a skeleton announced to screen readers while loading', async () => {
      const { el, text } = await setup(undefined, new Subject());

      expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text()).toContain('Đang tải lịch');
    });

    it('shows a failure with a retry that asks again', async () => {
      const { el, service, settle } = await setup(undefined, throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')));
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Có lỗi từ máy chủ');

      service.forDay.mockReturnValue(of(paged([block('a', 9, 0, 60)])));
      el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      await settle();

      expect(service.forDay).toHaveBeenCalledTimes(2);
      expect(blocks(el)).toHaveLength(1);
    });

    it('says when more than 50 tasks start that day and only the first are shown', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60)], 73)));

      expect(el.querySelector('.note')!.textContent).toContain('50 việc đầu tiên');
    });

    it('a stale response for a day the user already left never replaces the current one', async () => {
      const slow = new Subject<PagedResult<Task>>();
      const { service, el, settle } = await setup('/schedule?date=2026-11-12', slow);

      service.forDay.mockReturnValue(of(paged([block('new', 9, 0, 60)])));
      el.querySelector<HTMLButtonElement>('button[aria-label="Ngày sau"]')!.click();
      await settle();
      slow.next(paged([block('old', 9, 0, 60)]));
      await settle();

      expect(blocks(el).map((b) => b.getAttribute('href'))).toEqual(['/tasks/new']);
    });
  });

  describe('where the timeline opens', () => {
    // 06:00 is the first line, 84 px per hour, 16 px of margin above it and 14 px for the label that sticks out.
    const opensAt = (hour: number) => 16 + (hour - 6) * 84 - 14;

    it('today: the current hour is the first line, so nothing needs scrolling up to', async () => {
      vi.setSystemTime(new Date(2026, 10, 20, 13, 20));
      const { harness } = await setupWithComponent('/schedule?date=2026-11-20');

      expect(harness.component['focusTop']()).toBe(opensAt(13));
    });

    it('today before the first drawn hour opens at the top, and after the last at the bottom of the day', async () => {
      vi.setSystemTime(new Date(2026, 10, 20, 3, 0));
      const early = await setupWithComponent('/schedule?date=2026-11-20');
      expect(early.harness.component['focusTop']()).toBe(0);

      TestBed.resetTestingModule();
      vi.setSystemTime(new Date(2026, 10, 20, 23, 30));
      const late = await setupWithComponent('/schedule?date=2026-11-20');
      expect(late.harness.component['focusTop']()).toBe(late.harness.component['gridHeight']());
    });

    it('another day opens an hour before its first task', async () => {
      const { harness } = await setupWithComponent('/schedule?date=2026-11-12', of(paged([block('a', 10, 0, 60)])));

      expect(harness.component['focusTop']()).toBe(16 + (4 * 60 - 60) * PX_PER_MINUTE);
    });

    it('the clock ticking over does not move the timeline under the user', async () => {
      vi.setSystemTime(new Date(2026, 10, 20, 13, 20));
      vi.useFakeTimers({ toFake: ['Date', 'setInterval'] });
      vi.setSystemTime(new Date(2026, 10, 20, 13, 20));
      const { harness } = await setupWithComponent('/schedule?date=2026-11-20');
      const scroller = harness.routeNativeElement!.querySelector<HTMLElement>('.board__scroll')!;
      scroller.scrollTop = 40;

      vi.setSystemTime(new Date(2026, 10, 20, 14, 5));
      vi.advanceTimersByTime(60_000);
      harness.detectChanges();
      await harness.fixture.whenStable();

      expect(scroller.scrollTop).toBe(40);
    });
  });

  describe('pointing at a just-saved task', () => {
    const busyDay = () => of(paged([block('a', 8, 0, 60), block('b', 15, 0, 60), block('c', 20, 0, 30)]));

    it('lights up that task\'s block and removes the request from the address', async () => {
      const { el, router, settle } = await setup(`/schedule?date=${DAY}&highlight=b`, busyDay());
      await vi.waitFor(() => expect(router.url).toBe(`/schedule?date=${DAY}`));
      await settle();

      const lit = blocks(el).filter((b) => b.classList.contains('block--flash'));
      expect(lit).toHaveLength(1);
      expect(lit[0].textContent).toContain('Việc b');
    });

    it('does not reload the day just because the request was removed', async () => {
      const { service, router, settle } = await setup(`/schedule?date=${DAY}&highlight=b`, busyDay());

      await vi.waitFor(() => expect(router.url).toBe(`/schedule?date=${DAY}`));
      await settle();

      expect(service.forDay).toHaveBeenCalledTimes(1);
    });

    it('a task that is not on this day lights nothing, and the request is still removed', async () => {
      const { el, router, settle } = await setup(`/schedule?date=${DAY}&highlight=elsewhere`, busyDay());

      await vi.waitFor(() => expect(router.url).toBe(`/schedule?date=${DAY}`));
      await settle();

      expect(blocks(el).some((b) => b.classList.contains('block--flash'))).toBe(false);
    });

    it('scrolls the block to the middle of the visible part instead of the usual opening position', async () => {
      // jsdom does no layout, so the viewport height is stated and every scroll the planner asks for is recorded.
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
      const scrolls: number[] = [];
      Object.defineProperty(HTMLElement.prototype, 'scrollTop', { configurable: true, get: () => 0, set: (value: number) => scrolls.push(value) });

      try {
        await setup(`/schedule?date=${DAY}&highlight=c`, busyDay());
        await vi.waitFor(() => expect(scrolls.length).toBeGreaterThan(0));

        // 20:00 is 14 hours after the axis starts at 06:00; the block is 30 minutes, so its middle is 15 minutes in.
        const middle = 16 + (14 * 60 + 15) * PX_PER_MINUTE;
        expect(scrolls.at(-1)).toBeCloseTo(middle - 200, 5);
      } finally {
        delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
      }
    });
  });
});
