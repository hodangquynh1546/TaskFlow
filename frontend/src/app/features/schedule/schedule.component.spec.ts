import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../core/http/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { PagedResult, Task } from '../../shared/models/task.models';
import { UI_TEST_PROVIDERS, aTask } from '../tasks/test-support';
import { TaskService } from '../tasks/task.service';
import { PX_PER_MINUTE, ScheduleComponent } from './schedule.component';

const DAY = '2026-11-12';
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const paged = (items: Task[], totalCount = items.length): PagedResult<Task> => ({ items, page: 1, pageSize: 50, totalCount, totalPages: 1 });
const block = (id: string, h: number, m: number, duration: number | null, patch: Partial<Task> = {}) =>
  aTask({ id, title: `Việc ${id}`, startDate: at(h, m), durationMinutes: duration, ...patch });

async function setup(url = `/schedule?date=${DAY}`, scheduled: unknown = of(paged([]))) {
  const service = { forDay: vi.fn().mockReturnValue(scheduled), changeStatus: vi.fn(), delete: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ...UI_TEST_PROVIDERS,
      provideRouter([{ path: 'schedule', component: ScheduleComponent }, { path: 'tasks/new', component: ScheduleComponent }], withComponentInputBinding()),
      { provide: TaskService, useValue: service },
      { provide: NotifyService, useValue: notify },
      { provide: ConfirmService, useValue: confirm },
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

async function setupWithComponent(url: string, scheduled: unknown = of(paged([]))) {
  const service = { forDay: vi.fn().mockReturnValue(scheduled), changeStatus: vi.fn(), delete: vi.fn() };
  TestBed.configureTestingModule({
    providers: [
      ...UI_TEST_PROVIDERS,
      provideRouter([{ path: 'schedule', component: ScheduleComponent }], withComponentInputBinding()),
      { provide: TaskService, useValue: service },
      { provide: NotifyService, useValue: notify },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, ScheduleComponent);
  await harness.fixture.whenStable();
  harness.detectChanges();
  return { harness: Object.assign(harness, { component }) };
}

const notify = { success: vi.fn(), error: vi.fn() };
const confirm = { confirmDelete: vi.fn().mockResolvedValue(true), confirmDeleteMany: vi.fn().mockResolvedValue(true) };

const blocks = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('a.block')];

describe('ScheduleComponent, fitting the window', () => {
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  const resize = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  };
  afterEach(() => {
    resize(originalWidth, originalHeight);
    vi.restoreAllMocks();
  });

  /** Pretends the summary line, just above the planner, ends `bottom` px from the top of the window. */
  async function mountWith(url: string, width: number, height: number, bottom: number) {
    resize(width, height);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ bottom, top: bottom - 20, height: 20, width: 100, left: 0, right: 100, x: 0, y: bottom - 20, toJSON: () => ({}) });
    const { harness } = await setupWithComponent(url);
    return harness.component as unknown as { fit(): void; hourHeight(): number };
  }

  it('stretches the hours of the day so 8 of them fill a tall window down to its bottom', async () => {
    // 950 - 200 (summary bottom) - 56 (page bottom) = 694; minus 16 + 16 of margins = 662 for 8 rows
    const planner = await mountWith('/schedule?date=2026-11-12', 1470, 950, 200);

    expect(planner.hourHeight()).toBe(83);
  });

  it('does the same for the week with 7 rows and its header', async () => {
    // 694 - 16 - 16 - 56 (header) = 606 for 7 rows
    const planner = await mountWith('/schedule?date=2026-11-12&view=week', 1470, 950, 200);

    expect(planner.hourHeight()).toBe(87);
  });

  it('keeps the default on a window too short to grow', async () => {
    const planner = await mountWith('/schedule?date=2026-11-12', 1470, 600, 200);

    expect(planner.hourHeight()).toBe(72);
  });

  it('keeps the default on a phone, where the page scrolls', async () => {
    const planner = await mountWith('/schedule?date=2026-11-12', 390, 1200, 200);

    expect(planner.hourHeight()).toBe(72);
  });

  it('draws blocks at the stretched scale, so the axis and the blocks always agree', async () => {
    resize(1470, 950);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 200, top: 180, height: 20, width: 100, left: 0, right: 100, x: 0, y: 180, toJSON: () => ({}) });
    const { el, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    await settle();
    const [a] = blocks(el);
    const hour = Number.parseFloat((el.querySelector<HTMLElement>('.board')!.style.getPropertyValue('--hour-h')));

    expect(hour).toBe(83);
    expect(Number.parseFloat(a.style.top)).toBeCloseTo(9 * hour, 5);
    expect(Number.parseFloat(a.style.height)).toBeCloseTo(hour, 5);
  });
});

describe('ScheduleComponent, buttons on a block', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
    notify.success.mockClear();
    notify.error.mockClear();
    confirm.confirmDelete.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());

  const acts = (el: HTMLElement) => ({
    doing: el.querySelector<HTMLButtonElement>('tf-block-actions .act--doing')!,
    done: el.querySelector<HTMLButtonElement>('tf-block-actions .act--done')!,
    del: el.querySelector<HTMLButtonElement>('tf-block-actions .act--delete')!,
  });

  it('puts a yellow, a green and a red button right after each block, outside its link, each with a name', async () => {
    const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 11, 0, 60)])));

    expect(el.querySelectorAll('tf-block-actions')).toHaveLength(2);
    expect(el.querySelector('a.block + tf-block-actions')).not.toBeNull();
    expect(el.querySelector('a.block tf-block-actions')).toBeNull(); // a link may not contain buttons
    const { doing, done, del } = acts(el);
    expect([doing, done, del].map((b) => b.getAttribute('aria-label'))).toEqual(['Chuyển sang Đang làm: Việc a', 'Đánh dấu hoàn thành: Việc a', 'Xóa công việc: Việc a']);
  });

  it('is laid over its own block: same place and size', async () => {
    const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 9, 30, 60)])));
    const pairs = [...el.querySelectorAll<HTMLElement>('a.block')].map((a) => [a, a.nextElementSibling as HTMLElement]);

    for (const [a, tools] of pairs) {
      expect([tools.style.top, tools.style.height, tools.style.left, tools.style.width]).toEqual([a.style.top, a.style.height, a.style.left, a.style.width]);
    }
  });

  it('yellow sets "Đang làm" and the block changes in place, without reloading the planner', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    service.changeStatus.mockReturnValue(of(aTask({ id: 'a', title: 'Việc a', startDate: at(9), durationMinutes: 60, status: 'InProgress' })));

    acts(el).doing.click();
    await settle();

    expect(service.changeStatus).toHaveBeenCalledWith('a', 'InProgress');
    expect(blocks(el)[0].classList.contains('block--InProgress')).toBe(true);
    expect(service.forDay).toHaveBeenCalledTimes(1);
    expect(notify.success).toHaveBeenCalledWith('Đã chuyển sang Đang làm');
  });

  it('green sets "Hoàn thành", and the block is drawn as finished', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    service.changeStatus.mockReturnValue(of(aTask({ id: 'a', title: 'Việc a', startDate: at(9), durationMinutes: 60, status: 'Completed' })));

    acts(el).done.click();
    await settle();

    expect(service.changeStatus).toHaveBeenCalledWith('a', 'Completed');
    expect(blocks(el)[0].classList.contains('block--Completed')).toBe(true);
    expect(notify.success).toHaveBeenCalledWith('Đã đánh dấu hoàn thành');
  });

  it('finishing a repeating task says when the next one is', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    service.changeStatus.mockReturnValue(of(aTask({ id: 'a', startDate: at(9), status: 'Completed', next: { id: 'n', startDate: new Date(2026, 10, 24, 9, 0).toISOString() } })));

    acts(el).done.click();
    await settle();

    expect(notify.success.mock.calls[0][0]).toMatch(/^Đã hoàn thành\. Việc kế tiếp:/);
  });

  it('the button of the status the task already has is shown pressed, and pressing it puts the task back to "to do"', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60, { status: 'InProgress' })])));
    service.changeStatus.mockReturnValue(of(aTask({ id: 'a', title: 'Việc a', startDate: at(9), durationMinutes: 60, status: 'Todo' })));
    const { doing, done } = acts(el);

    expect(doing.getAttribute('aria-pressed')).toBe('true');
    expect(done.getAttribute('aria-pressed')).toBe('false');
    doing.click();
    await settle();

    expect(service.changeStatus).toHaveBeenCalledWith('a', 'Todo');
    expect(notify.success).toHaveBeenCalledWith('Đã chuyển sang Chưa làm');
    expect(blocks(el)[0].classList.contains('block--InProgress')).toBe(false);
  });

  it('shows the server message and leaves the block alone when the change fails', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    service.changeStatus.mockReturnValue(throwError(() => new ApiError(500, 'Máy chủ lỗi.')));

    acts(el).done.click();
    await settle();

    expect(notify.error).toHaveBeenCalledWith('Máy chủ lỗi.');
    expect(blocks(el)[0].classList.contains('block--Completed')).toBe(false);
    expect(acts(el).done.disabled).toBe(false); // free to try again
  });

  it('red asks first, and only deletes once confirmed, taking the block off the planner', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 11, 0, 60)])));
    service.delete.mockReturnValue(of(undefined));

    acts(el).del.click();
    await settle();

    expect(confirm.confirmDelete).toHaveBeenCalledWith('Việc a');
    expect(service.delete).toHaveBeenCalledWith('a');
    expect(blocks(el).map((b) => b.querySelector('.block__title')!.textContent)).toEqual(['Việc b']);
    expect(notify.success).toHaveBeenCalledWith('Đã xóa công việc');
  });

  it('keeps the task when the deletion is not confirmed', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    confirm.confirmDelete.mockResolvedValue(false);

    acts(el).del.click();
    await settle();

    expect(service.delete).not.toHaveBeenCalled();
    expect(blocks(el)).toHaveLength(1);
  });

  it('keeps the task and says why when the deletion fails', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    service.delete.mockReturnValue(throwError(() => new ApiError(404, 'Không tìm thấy.')));

    acts(el).del.click();
    await settle();

    expect(notify.error).toHaveBeenCalledWith('Không tìm thấy.');
    expect(blocks(el)).toHaveLength(1);
  });

  it('every button waits while its task has a change in flight, so a double click sends one request', async () => {
    const { el, service, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    const slow = new Subject<Task>();
    service.changeStatus.mockReturnValue(slow);

    acts(el).done.click();
    await settle();
    expect(acts(el).done.disabled && acts(el).doing.disabled && acts(el).del.disabled).toBe(true);
    acts(el).done.click();

    expect(service.changeStatus).toHaveBeenCalledTimes(1);
    slow.next(aTask({ id: 'a', startDate: at(9), status: 'Completed' }));
    await settle();
    expect(acts(el).done.disabled).toBe(false);
  });
});

describe('ScheduleComponent, selecting several tasks', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
    notify.success.mockClear();
    notify.error.mockClear();
    confirm.confirmDeleteMany.mockReset().mockResolvedValue(true);
  });
  afterEach(() => vi.useRealTimers());

  const three = () => of(paged([block('a', 9, 0, 60), block('b', 11, 0, 60), block('c', 13, 0, 60)]));
  const button = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label)!;
  const pickedTitles = (el: HTMLElement) => blocks(el).filter((b) => b.classList.contains('block--picked')).map((b) => b.querySelector('.block__title')!.textContent);
  const tap = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  it('"Chọn nhiều" turns the mode on: a hint replaces the summary and the blocks stop being links', async () => {
    const { el, settle } = await setup(undefined, three());
    expect(el.querySelector('.bulk')).toBeNull();

    button(el, 'Chọn nhiều').click();
    await settle();

    expect(el.querySelector('.bulk')!.textContent).toContain('Bấm vào các việc trên lịch để chọn.');
    expect(el.querySelector('.summary')).toBeNull();
    expect(blocks(el).every((b) => b.getAttribute('href') === null && b.getAttribute('role') === 'button')).toBe(true);
    expect(el.querySelectorAll('tf-block-actions')).toHaveLength(0); // the per-block buttons are put away
    expect(button(el, 'Xong').getAttribute('aria-pressed')).toBe('true');
  });

  it('a tap on a block picks it, a second tap lets go, and the count says how many', async () => {
    const { el, router, settle } = await setup(undefined, three());
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    button(el, 'Chọn nhiều').click();
    await settle();

    tap(blocks(el)[0]);
    tap(blocks(el)[2]);
    await settle();
    expect(pickedTitles(el)).toEqual(['Việc a', 'Việc c']);
    expect(blocks(el)[0].getAttribute('aria-pressed')).toBe('true');
    expect(blocks(el)[1].getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('.bulk__count')!.textContent).toBe('Đã chọn 2 việc');

    tap(blocks(el)[0]);
    await settle();
    expect(pickedTitles(el)).toEqual(['Việc c']);
    expect(navigate).not.toHaveBeenCalled(); // picking never opens the task
  });

  it('"Chọn tất cả" picks every task on screen and "Bỏ chọn" clears them', async () => {
    const { el, settle } = await setup(undefined, three());
    button(el, 'Chọn nhiều').click();
    await settle();

    button(el, 'Chọn tất cả').click();
    await settle();
    expect(pickedTitles(el)).toEqual(['Việc a', 'Việc b', 'Việc c']);

    button(el, 'Bỏ chọn').click();
    await settle();
    expect(pickedTitles(el)).toEqual([]);
    expect(button(el, 'Xóa đã chọn').disabled).toBe(true);
  });

  it('deleting asks once for all of them, deletes each, and takes them off the planner', async () => {
    const { el, service, settle } = await setup(undefined, three());
    service.delete.mockReturnValue(of(undefined));
    button(el, 'Chọn nhiều').click();
    await settle();
    tap(blocks(el)[0]);
    tap(blocks(el)[1]);
    await settle();

    button(el, 'Xóa đã chọn').click();
    await vi.waitFor(() => expect(notify.success).toHaveBeenCalled());
    await settle();

    expect(confirm.confirmDeleteMany).toHaveBeenCalledTimes(1);
    expect(confirm.confirmDeleteMany).toHaveBeenCalledWith(2);
    expect(service.delete.mock.calls.map(([id]) => id).sort()).toEqual(['a', 'b']);
    expect(blocks(el).map((b) => b.querySelector('.block__title')!.textContent)).toEqual(['Việc c']);
    expect(notify.success).toHaveBeenCalledWith('Đã xóa 2 công việc');
    expect(el.querySelector('.bulk__count')!.textContent).toBe('Bấm vào các việc trên lịch để chọn.');
  });

  it('nothing is deleted when the confirmation is declined, and the picks stay', async () => {
    const { el, service, settle } = await setup(undefined, three());
    confirm.confirmDeleteMany.mockResolvedValue(false);
    button(el, 'Chọn nhiều').click();
    await settle();
    tap(blocks(el)[0]);
    await settle();

    button(el, 'Xóa đã chọn').click();
    await settle();

    expect(service.delete).not.toHaveBeenCalled();
    expect(pickedTitles(el)).toEqual(['Việc a']);
  });

  it('when some deletions fail, the others still go, and the failed ones stay picked with a message', async () => {
    const { el, service, settle } = await setup(undefined, three());
    service.delete.mockImplementation((id: string) => (id === 'b' ? throwError(() => new ApiError(500, 'Lỗi.')) : of(undefined)));
    button(el, 'Chọn nhiều').click();
    await settle();
    button(el, 'Chọn tất cả').click();
    await settle();

    button(el, 'Xóa đã chọn').click();
    await vi.waitFor(() => expect(notify.error).toHaveBeenCalled());
    await settle();

    expect(blocks(el).map((b) => b.querySelector('.block__title')!.textContent)).toEqual(['Việc b']);
    expect(pickedTitles(el)).toEqual(['Việc b']);
    expect(notify.success).toHaveBeenCalledWith('Đã xóa 2 công việc');
    expect(notify.error).toHaveBeenCalledWith('Không xóa được 1 công việc. Chúng vẫn được chọn, thử lại sau.');
  });

  it('"Xong" and the Esc key leave the mode and drop the picks; the blocks are links again', async () => {
    const { el, settle } = await setup(undefined, three());
    button(el, 'Chọn nhiều').click();
    await settle();
    tap(blocks(el)[0]);
    await settle();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();

    expect(el.querySelector('.bulk')).toBeNull();
    expect(pickedTitles(el)).toEqual([]);
    expect(blocks(el)[0].getAttribute('href')).toBe('/tasks/a');
    expect(el.querySelectorAll('tf-block-actions')).toHaveLength(3);
  });

  it('going to another day drops the picks but stays in the mode', async () => {
    const { el, settle } = await setup(undefined, three());
    button(el, 'Chọn nhiều').click();
    await settle();
    tap(blocks(el)[0]);
    await settle();

    el.querySelector<HTMLButtonElement>('button[aria-label="Ngày sau"]')!.click();
    await settle();

    expect(el.querySelector('.bulk')).not.toBeNull();
    expect(pickedTitles(el)).toEqual([]);
  });
});

describe('ScheduleComponent, tapping a block on a touch screen', () => {
  let restoreMedia: () => void;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0));
    // A device with no hover: what a phone or a tablet reports.
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({ ...original(query), matches: query.includes('hover: none') || query.includes('prefers-reduced-motion') })) as typeof window.matchMedia;
    restoreMedia = () => (window.matchMedia = original);
  });
  afterEach(() => {
    restoreMedia();
    vi.useRealTimers();
  });

  const tap = (el: Element) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  it('a block that was not tapped yet is not a link, so the first tap cannot open the task', async () => {
    const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    const [a] = blocks(el);

    expect(a.getAttribute('href')).toBeNull();
    expect(a.getAttribute('role')).toBe('button');
    expect(a.getAttribute('aria-expanded')).toBe('false');
  });

  it('the first tap selects the block and shows its buttons instead of opening the task', async () => {
    const { el, router, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    tap(blocks(el)[0]);
    await settle();

    expect(blocks(el)[0].classList.contains('block--selected')).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    // Selected, it is the link again, and the buttons next to it are the ones the stylesheet shows.
    expect(blocks(el)[0].getAttribute('href')).toBe('/tasks/a');
    expect(blocks(el)[0].nextElementSibling!.tagName).toBe('TF-BLOCK-ACTIONS');
  });

  it('a second tap on the same block opens the task', async () => {
    const { el, router, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    tap(blocks(el)[0]);
    await settle();
    tap(blocks(el)[0]);
    await settle();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(String(navigate.mock.calls[0][0])).toBe('/tasks/a');
  });

  it('tapping another block moves the selection to it', async () => {
    const { el, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60), block('b', 11, 0, 60)])));

    tap(blocks(el)[0]);
    await settle();
    tap(blocks(el)[1]);
    await settle();

    expect(blocks(el).map((b) => b.classList.contains('block--selected'))).toEqual([false, true]);
  });

  it('tapping anywhere else puts the buttons away, but tapping the buttons does not', async () => {
    const { el, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    tap(blocks(el)[0]);
    await settle();

    tap(el.querySelector('tf-block-actions .act--doing')!);
    await settle();
    expect(blocks(el)[0].classList.contains('block--selected')).toBe(true);

    tap(document.body);
    await settle();
    expect(blocks(el)[0].classList.contains('block--selected')).toBe(false);
  });

  it('going to another day clears the selection', async () => {
    const { el, settle } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
    tap(blocks(el)[0]);
    await settle();

    el.querySelector<HTMLButtonElement>('button[aria-label="Ngày sau"]')!.click();
    await settle();

    expect(el.querySelector('.block--selected')).toBeNull();
  });

  it('works the same in the week grid', async () => {
    const original = window.matchMedia;
    const service = { forDay: vi.fn((day: string) => of(paged(day === '2026-11-12' ? [block('a', 9, 0, 60, { startDate: at(9) })] : []))), changeStatus: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        ...UI_TEST_PROVIDERS,
        provideRouter([{ path: 'schedule', component: ScheduleComponent }], withComponentInputBinding()),
        { provide: TaskService, useValue: service },
        { provide: NotifyService, useValue: notify },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/schedule?view=week&date=2026-11-12', ScheduleComponent);
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
    const el = harness.routeNativeElement as HTMLElement;
    const grid = () => el.querySelector<HTMLElement>('.week__col a.block')!;

    expect(grid().getAttribute('href')).toBeNull();
    tap(grid());
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }

    expect(grid().classList.contains('block--selected')).toBe(true);
    expect(grid().getAttribute('href')).toBe('/tasks/a');
    window.matchMedia = original;
  });
});

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
    });

    it.each([['abc'], ['2026-02-30'], ['2026-13-01'], ['12/11/2026'], ['']])('falls back to today for the invalid date %j', async (bad) => {
      const { service } = await setup(`/schedule?date=${encodeURIComponent(bad)}`);

      expect(service.forDay).toHaveBeenCalledWith('2026-11-20');
    });

    it('shows today when there is no date at all', async () => {
      const { service, el } = await setup('/schedule');

      expect(service.forDay).toHaveBeenCalledWith('2026-11-20');
      expect([...el.querySelectorAll<HTMLButtonElement>('.nav button')].find((b) => b.textContent!.trim() === 'Hôm nay')!.disabled).toBe(true); // "Hôm nay" is already today
    });
  });

  describe('the timeline', () => {
    it('draws a block at the right height for its time and length', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, 60)])));
      const [a] = blocks(el);

      // 00:00 is the top of the axis, so 09:00 is 540 minutes down.
      expect(a.style.top).toBe(`${540 * PX_PER_MINUTE}px`);
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
      const { el } = await setup(undefined, of(paged([block('s', 9, 0, 15), block('l', 11, 0, 60), block('m', 13, 0, 30), block('n', 15, 0, 45)])));
      const [short, long, half, threeQuarters] = blocks(el);

      expect(short.classList.contains('block--short')).toBe(true);
      expect(long.classList.contains('block--short')).toBe(false);
      expect(half.classList.contains('block--short')).toBe(true); // 30 minutes is 36px: not enough for two lines
      expect(threeQuarters.classList.contains('block--short')).toBe(false); // 45 minutes is 54px: it fits two
    });

    it('a task with a start but no length is drawn as an estimate', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 9, 0, null)])));

      expect(blocks(el)[0].classList.contains('block--estimated')).toBe(true);
      expect(blocks(el)[0].getAttribute('aria-label')).toContain('chưa có thời lượng');
    });

    it('shows an early or a late task without stretching: the axis is already the whole day', async () => {
      const { el } = await setup(undefined, of(paged([block('a', 4, 0, 60), block('b', 23, 0, 60)])));

      expect(el.querySelector('.hour__label')!.textContent).toBe('00:00');
      expect(el.querySelectorAll('.hour__label')).toHaveLength(24);
    });

    it('labels every hour of the day, 00:00 to 23:00', async () => {
      const { el } = await setup();

      const labels = [...el.querySelectorAll('.hour__label')].map((l) => l.textContent);
      expect(labels[0]).toBe('00:00');
      expect(labels.at(-1)).toBe('23:00');
      expect(labels).toHaveLength(24);
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
      expect((today.el.querySelector<HTMLElement>('.now'))!.style.top).toBe(`${(10 * 60 + 30) * PX_PER_MINUTE}px`);
      expect(today.el.querySelector('.now')!.getAttribute('aria-hidden')).toBe('true');
      TestBed.resetTestingModule();

      const other = await setup('/schedule?date=2026-11-13');
      expect(other.el.querySelector('.now')).toBeNull();
    });

    it('is drawn at any hour of the day, including late at night', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 12, 23, 0));

      const { el } = await setup('/schedule?date=2026-11-12');

      expect((el.querySelector<HTMLElement>('.now'))!.style.top).toBe(`${23 * 60 * PX_PER_MINUTE}px`);
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
    // 00:00 is the first line, an hour is 60 * PX_PER_MINUTE px, with 16 px of margin above it and 14 px for the label that sticks out.
    const opensAt = (hour: number) => 16 + hour * 60 * PX_PER_MINUTE - 14;

    it('today: the current hour is the first line, so nothing needs scrolling up to', async () => {
      vi.setSystemTime(new Date(2026, 10, 20, 13, 20));
      const { harness } = await setupWithComponent('/schedule?date=2026-11-20');

      expect(harness.component['focusTop']()).toBe(opensAt(13));
    });

    it('shortly after midnight the day opens at its very top, and late in the evening at that hour', async () => {
      vi.setSystemTime(new Date(2026, 10, 20, 0, 10));
      const early = await setupWithComponent('/schedule?date=2026-11-20');
      expect(early.harness.component['focusTop']()).toBe(opensAt(0));

      TestBed.resetTestingModule();
      vi.setSystemTime(new Date(2026, 10, 20, 23, 30));
      const late = await setupWithComponent('/schedule?date=2026-11-20');
      expect(late.harness.component['focusTop']()).toBeCloseTo(opensAt(23), 5);
    });

    it('another day opens an hour before its first task', async () => {
      const { harness } = await setupWithComponent('/schedule?date=2026-11-12', of(paged([block('a', 10, 0, 60)])));

      expect(harness.component['focusTop']()).toBe(16 + (10 * 60 - 60) * PX_PER_MINUTE);
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

        // 20:00 is 20 hours after the axis starts at 00:00; the block is 30 minutes, so its middle is 15 minutes in.
        const middle = 16 + (20 * 60 + 15) * PX_PER_MINUTE;
        expect(scrolls.at(-1)).toBeCloseTo(middle - 200, 5);
      } finally {
        delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
      }
    });
  });
});
