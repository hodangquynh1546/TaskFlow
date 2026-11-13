import { registerLocaleData } from '@angular/common';
import vi_locale from '@angular/common/locales/vi';
import { LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNzI18n, vi_VN } from 'ng-zorro-antd/i18n';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../../core/http/api-error';
import { NotifyService } from '../../../core/notify/notify.service';
import { PagedResult, Task } from '../../../shared/models/task.models';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { DEFAULT_QUERY } from '../task-query';
import { TaskService } from '../task.service';
import { TaskListComponent } from './task-list.component';

registerLocaleData(vi_locale);

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Viết báo cáo', description: 'Báo cáo quý 4', status: 'Todo', priority: 'Medium', startDate: null,
  dueDate: null, durationMinutes: null, isOverdue: false, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', ...patch,
});
const page = (items: Task[], patch: Partial<PagedResult<Task>> = {}): PagedResult<Task> => ({
  items, page: 1, pageSize: 10, totalCount: items.length, totalPages: Math.max(1, Math.ceil(items.length / 10)), ...patch,
});

async function setup(url = '/tasks', first: unknown = of(page([task({ id: 'a', title: 'Việc A' }), task({ id: 'b', title: 'Việc B', status: 'Completed' })]))) {
  const service = { list: vi.fn().mockReturnValue(first), changeStatus: vi.fn(), delete: vi.fn() };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const confirm = { confirmDelete: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'tasks', component: TaskListComponent }, { path: 'tasks/new', component: TaskListComponent }]),
      provideNzIconsTesting(),
      provideNzI18n(vi_VN),
      { provide: LOCALE_ID, useValue: 'vi' },
      { provide: TaskService, useValue: service },
      { provide: NotifyService, useValue: notify },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const component = await harness.navigateByUrl(url, TaskListComponent);
  const router = TestBed.inject(Router);
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  };
  await settle();
  const el = harness.routeNativeElement as HTMLElement;
  return { harness, component, service, notify, confirm, router, el, settle, text: () => el.textContent ?? '', lastQuery: () => service.list.mock.calls.at(-1)![0] };
}

const rowTitles = (el: HTMLElement) => [...el.querySelectorAll('.row__title')].map((a) => a.textContent!.trim());

describe('TaskListComponent', () => {
  describe('loading and showing tasks', () => {
    it('requests the default query for a bare /tasks and shows each task with a link to it', async () => {
      const { service, el, lastQuery } = await setup();

      expect(service.list).toHaveBeenCalledTimes(1);
      expect(lastQuery()).toEqual(DEFAULT_QUERY);
      expect(rowTitles(el)).toEqual(['Việc A', 'Việc B']);
      expect(el.querySelector('.row__title')!.getAttribute('href')).toBe('/tasks/a');
    });

    it('shows how many tasks are listed, in a polite live region', async () => {
      const { el } = await setup('/tasks', of(page([task()], { page: 2, pageSize: 10, totalCount: 11, totalPages: 2 })));

      expect(el.querySelector('.summary')!.textContent).toBe('11–11 trên 11 công việc');
      expect(el.querySelector('.summary')!.getAttribute('aria-live')).toBe('polite');
    });

    it('shows a loading skeleton announced to screen readers, never an empty state, until data arrives', async () => {
      const { el, text } = await setup('/tasks', new Subject());

      expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(text()).toContain('Đang tải danh sách công việc');
      expect(el.querySelector('tf-empty-state')).toBeNull();
    });

    it('shows description, priority, status and due label on each row, and strikes through finished work', async () => {
      const { el } = await setup('/tasks', of(page([task({ status: 'Completed', priority: 'High', dueDate: '2026-01-01T10:00:00Z' })])));
      const row = el.querySelector('.row')!;

      expect(row.querySelector('.row__description')!.textContent).toBe('Báo cáo quý 4');
      expect(row.querySelector('tf-priority')).not.toBeNull();
      expect(row.querySelector('.seg__btn--Completed')!.getAttribute('aria-pressed')).toBe('true');
      expect(row.querySelector('tf-due')).not.toBeNull();
      expect(row.classList.contains('row--done')).toBe(true);
    });

    it('gives every row action an accessible name that includes the task title', async () => {
      const { el } = await setup('/tasks', of(page([task({ title: 'Họp nhóm' })])));

      expect(el.querySelector('.seg')!.getAttribute('aria-label')).toBe('Trạng thái của Họp nhóm');
      expect(el.querySelector('.row__menu')!.getAttribute('aria-label')).toBe('Thao tác với Họp nhóm');
    });
  });

  describe('the URL drives the query', () => {
    it('reads filters, sorting and paging from the URL', async () => {
      const { lastQuery } = await setup('/tasks?search=b%C3%A1o&status=Todo&priority=High&overdue=true&dueFrom=2026-11-01&dueTo=2026-11-30&sortBy=dueDate&sortDir=asc&page=3&pageSize=20');

      expect(lastQuery()).toEqual({
        search: 'báo', status: 'Todo', priority: 'High', overdue: true, dueFrom: '2026-11-01', dueTo: '2026-11-30',
        sortBy: 'dueDate', sortDir: 'asc', page: 3, pageSize: 20,
      });
    });

    it('ignores invalid values in the URL instead of failing', async () => {
      const { lastQuery, text } = await setup('/tasks?status=Nope&page=-4&sortBy=title&pageSize=999');

      expect(lastQuery()).toEqual(DEFAULT_QUERY);
      expect(text()).not.toContain('Không tải được');
    });

    it('fills the search box from the URL', async () => {
      const { el } = await setup('/tasks?search=h%C3%B3a%20%C4%91%C6%A1n');

      expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('hóa đơn');
    });

    it('toggling the sort direction updates the URL and reloads, back at page 1', async () => {
      const { el, router, settle, lastQuery } = await setup('/tasks?page=3');

      el.querySelector<HTMLButtonElement>('.toolbar__direction')!.click();
      await settle();

      expect(router.url).toBe('/tasks?sortDir=desc');
      expect(lastQuery()).toMatchObject({ sortDir: 'desc', page: 1 });
    });

    it('describes the current direction on the sort button', async () => {
      const { el } = await setup('/tasks?sortDir=asc');

      expect(el.querySelector('.toolbar__direction')!.getAttribute('aria-label')).toContain('Đang tăng dần');
    });

    it('the overdue checkbox goes into the URL and resets to page 1', async () => {
      const { el, router, settle, lastQuery } = await setup('/tasks?page=2');

      el.querySelector<HTMLInputElement>('label[nz-checkbox] input')!.click();
      await settle();

      expect(router.url).toBe('/tasks?overdue=true');
      expect(lastQuery()).toMatchObject({ overdue: true, page: 1 });
    });

    it('choosing a status or priority filters, resets the page and shows the clear button', async () => {
      const { component, router, settle, lastQuery, el } = await setup('/tasks?page=4');

      component['setStatus']('InProgress');
      await settle();
      component['setPriority']('High');
      await settle();

      expect(router.url).toBe('/tasks?status=InProgress&priority=High');
      expect(lastQuery()).toMatchObject({ status: 'InProgress', priority: 'High', page: 1 });
      expect(el.querySelector('.toolbar__clear')).not.toBeNull();
    });

    it('choosing a due range sets both ends, clearing it removes both', async () => {
      const { component, router, settle, lastQuery } = await setup('/tasks');

      component['setRange']([new Date(2026, 10, 1), new Date(2026, 10, 30)]);
      await settle();
      expect(router.url).toBe('/tasks?dueFrom=2026-11-01&dueTo=2026-11-30');
      expect(lastQuery()).toMatchObject({ dueFrom: '2026-11-01', dueTo: '2026-11-30' });

      component['setRange'](null);
      await settle();
      expect(router.url).toBe('/tasks');
    });

    it('typing in the search box waits for a pause, then filters and goes back to page 1', async () => {
      const { el, router, service, lastQuery } = await setup('/tasks?page=2');
      const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;

      input.value = 'báo';
      input.dispatchEvent(new Event('input'));
      input.value = 'báo cáo';
      input.dispatchEvent(new Event('input'));
      const callsWhileTyping = service.list.mock.calls.length;
      await vi.waitFor(() => expect(router.url).toBe('/tasks?search=b%C3%A1o%20c%C3%A1o'), { timeout: 2000 });

      expect(callsWhileTyping).toBe(1); // nothing was requested per keystroke
      expect(lastQuery()).toMatchObject({ search: 'báo cáo', page: 1 });
    });

    it('does not add a history entry for every search, so Back leaves the page instead of replaying typing', async () => {
      const { el, router } = await setup('/tasks');
      const before = history.length;
      const input = el.querySelector<HTMLInputElement>('input[type="search"]')!;

      input.value = 'abc';
      input.dispatchEvent(new Event('input'));
      await vi.waitFor(() => expect(router.url).toContain('search=abc'), { timeout: 2000 });

      expect(history.length).toBe(before);
    });
  });

  describe('clearing filters', () => {
    it('shows the clear button only while a filter is applied, and clearing keeps the sort order', async () => {
      const none = await setup('/tasks?sortBy=dueDate');
      expect(none.el.querySelector('.toolbar__clear')).toBeNull();
      TestBed.resetTestingModule();

      const { el, router, settle } = await setup('/tasks?status=Todo&search=x&sortBy=dueDate&page=3');
      el.querySelector<HTMLButtonElement>('.toolbar__clear')!.click();
      await settle();

      expect(router.url).toBe('/tasks?sortBy=dueDate');
    });

    it('the search box empties when filters are cleared', async () => {
      const { el, settle } = await setup('/tasks?search=abc');

      el.querySelector<HTMLButtonElement>('.toolbar__clear')!.click();
      await settle();

      expect(el.querySelector<HTMLInputElement>('input[type="search"]')!.value).toBe('');
    });
  });

  describe('empty, error and retry', () => {
    it('with no tasks and no filters, invites the user to create the first one', async () => {
      const { el, router, settle } = await setup('/tasks', of(page([])));

      expect(el.textContent).toContain('Chưa có công việc nào.');
      el.querySelector<HTMLButtonElement>('tf-empty-state button')!.click();
      await settle();

      expect(router.url).toBe('/tasks/new');
    });

    it('with filters that match nothing, says so and offers to clear them (a different message from "no tasks")', async () => {
      const { el, text, router, settle } = await setup('/tasks?status=Todo', of(page([])));

      expect(text()).toContain('Không có công việc khớp bộ lọc.');
      expect(text()).not.toContain('Chưa có công việc nào.');
      el.querySelector<HTMLButtonElement>('tf-empty-state button')!.click();
      await settle();

      expect(router.url).toBe('/tasks');
    });

    it('shows a load failure with a retry that asks again', async () => {
      const { el, service, settle, text } = await setup('/tasks', throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')));
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Có lỗi từ máy chủ');

      service.list.mockReturnValue(of(page([task({ title: 'Đã tải' })])));
      el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      await settle();

      expect(service.list).toHaveBeenCalledTimes(2);
      expect(text()).toContain('Đã tải');
    });

    it('a slow earlier response never overwrites a newer one', async () => {
      const slow = new Subject<PagedResult<Task>>();
      const { component, service, settle, text } = await setup('/tasks', slow);

      service.list.mockReturnValue(of(page([task({ title: 'Kết quả mới' })])));
      component['setStatus']('Todo');
      await settle();
      slow.next(page([task({ title: 'Kết quả cũ' })]));
      await settle();

      expect(text()).toContain('Kết quả mới');
      expect(text()).not.toContain('Kết quả cũ');
    });
  });

  describe('pagination', () => {
    it('shows the pager only when there is more than one page of results', async () => {
      const few = await setup('/tasks', of(page([task()])));
      expect(few.el.querySelectorAll('nz-pagination li')).toHaveLength(0);
      TestBed.resetTestingModule();

      const many = await setup('/tasks', of(page([task()], { totalCount: 45, totalPages: 5 })));
      expect(many.el.querySelector('nz-pagination li[title="5"]')).not.toBeNull();
    });

    it('choosing another page updates the URL and reloads', async () => {
      const { el, router, settle, lastQuery } = await setup('/tasks', of(page([task()], { totalCount: 45, totalPages: 5 })));

      el.querySelector<HTMLElement>('nz-pagination li[title="3"]')!.click();
      await settle();

      expect(router.url).toBe('/tasks?page=3');
      expect(lastQuery().page).toBe(3);
    });

    it('changing the page size goes back to page 1', async () => {
      const { component, router, settle } = await setup('/tasks?page=3', of(page([task()], { page: 3, totalCount: 45, totalPages: 5 })));

      component['setPageSize'](20);
      await settle();

      expect(router.url).toBe('/tasks?pageSize=20');
    });

    it('a page past the end (after deleting the last row, or a stale link) moves to the real last page', async () => {
      const { service, router, settle } = await setup('/tasks?page=3', of(page([], { page: 3, totalCount: 20, totalPages: 2 })));

      service.list.mockReturnValue(of(page([task({ title: 'Trang cuối' })], { page: 2, totalCount: 20, totalPages: 2 })));
      await settle();
      await vi.waitFor(() => expect(router.url).toBe('/tasks?page=2'));
    });
  });

  describe('changing status from the list', () => {
    const button = (el: HTMLElement, row: number, status: string) =>
      el.querySelectorAll('.row')[row].querySelector<HTMLButtonElement>(`.seg__btn--${status}`)!;

    it('shows all three statuses on every row and marks the current one', async () => {
      const { el } = await setup();

      const labels = [...el.querySelectorAll('.row')[0].querySelectorAll('.seg__btn')].map((b) => b.textContent!.trim());
      expect(labels).toEqual(['Chưa làm', 'Đang làm', 'Hoàn thành']);
      expect(button(el, 0, 'Todo').getAttribute('aria-pressed')).toBe('true');
      expect(button(el, 0, 'Completed').getAttribute('aria-pressed')).toBe('false');
      expect(button(el, 1, 'Completed').getAttribute('aria-pressed')).toBe('true');
    });

    it('"Hoàn thành" finishes an open task, tells the user, and refreshes in place without a skeleton', async () => {
      const { el, service, notify, settle } = await setup();
      service.changeStatus.mockReturnValue(of(task()));

      button(el, 0, 'Completed').click();
      await settle();

      expect(service.changeStatus).toHaveBeenCalledWith('a', 'Completed');
      expect(notify.success).toHaveBeenCalledWith('Đã đánh dấu hoàn thành');
      expect(service.list).toHaveBeenCalledTimes(2);
      expect(el.querySelector('[aria-busy="true"]')).toBeNull();
    });

    it('"Đang làm" and "Chưa làm" set exactly that status', async () => {
      const { el, service, notify, settle } = await setup();
      service.changeStatus.mockReturnValue(of(task()));

      button(el, 0, 'InProgress').click();
      await settle();
      expect(service.changeStatus).toHaveBeenLastCalledWith('a', 'InProgress');
      expect(notify.success).toHaveBeenLastCalledWith('Đã chuyển sang Đang làm');

      button(el, 1, 'Todo').click();
      await settle();
      expect(service.changeStatus).toHaveBeenLastCalledWith('b', 'Todo');
      expect(notify.success).toHaveBeenLastCalledWith('Đã chuyển sang Chưa làm');
    });

    it('pressing the status a task already has sends nothing', async () => {
      const { el, service, settle } = await setup();

      button(el, 0, 'Todo').click();
      await settle();

      expect(service.changeStatus).not.toHaveBeenCalled();
    });

    it('a failed change is reported and does not refresh the list', async () => {
      const { el, service, notify, settle } = await setup();
      service.changeStatus.mockReturnValue(throwError(() => new ApiError(404, 'Không tìm thấy công việc.')));

      button(el, 0, 'Completed').click();
      await settle();

      expect(notify.error).toHaveBeenCalledWith('Không tìm thấy công việc.');
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('a row is locked while its change is in flight, so a double click sends one request', async () => {
      const { el, service, settle } = await setup();
      service.changeStatus.mockReturnValue(new Subject());
      const done = button(el, 0, 'Completed');

      done.click();
      await settle();
      done.click();

      expect(service.changeStatus).toHaveBeenCalledTimes(1);
      expect(done.disabled).toBe(true);
      expect(el.querySelector('.row')!.classList.contains('row--busy')).toBe(true);
    });
  });

  describe('overdue rows', () => {
    it('are flagged red; on-time and finished rows are not', async () => {
      const { el } = await setup('/tasks', of(page([
        task({ id: 'x', title: 'Trễ', isOverdue: true, dueDate: '2026-11-01T00:00:00Z' }),
        task({ id: 'y', title: 'Đúng hạn' }),
        task({ id: 'z', title: 'Xong', status: 'Completed' }),
      ])));

      const flags = [...el.querySelectorAll('.row')].map((r) => r.classList.contains('row--overdue'));
      expect(flags).toEqual([true, false, false]);
    });
  });

  describe('deleting', () => {
    it('asks for confirmation naming the task, then deletes, tells the user and refreshes', async () => {
      const { component, service, confirm, notify, settle } = await setup();
      service.delete.mockReturnValue(of(undefined));

      await component['remove'](task({ id: 'a', title: 'Việc A' }));
      await settle();

      expect(confirm.confirmDelete).toHaveBeenCalledWith('Việc A');
      expect(service.delete).toHaveBeenCalledWith('a');
      expect(notify.success).toHaveBeenCalledWith('Đã xóa công việc');
      expect(service.list).toHaveBeenCalledTimes(2);
    });

    it('does nothing at all when the user keeps the task', async () => {
      const { component, service, confirm, notify } = await setup();
      confirm.confirmDelete.mockResolvedValue(false);

      await component['remove'](task());

      expect(service.delete).not.toHaveBeenCalled();
      expect(notify.success).not.toHaveBeenCalled();
      expect(service.list).toHaveBeenCalledTimes(1);
    });

    it('reports a failed delete and leaves the list as it was', async () => {
      const { component, service, notify, settle } = await setup();
      service.delete.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

      await component['remove'](task());
      await settle();

      expect(notify.error).toHaveBeenCalledWith('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
      expect(service.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('small screens', () => {
    it('the filters button reports whether the filters are open', async () => {
      const { el, harness } = await setup();
      const toggle = el.querySelector<HTMLButtonElement>('.toolbar__toggle')!;

      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      toggle.click();
      harness.detectChanges();

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(el.querySelector('.toolbar__filters')!.classList.contains('toolbar__filters--open')).toBe(true);
    });

    it('the filters button shows how many filters are applied', async () => {
      const { el } = await setup('/tasks?status=Todo&overdue=true&search=x');

      expect(el.querySelector('.toolbar__count')!.textContent).toBe('3');
    });
  });
});
