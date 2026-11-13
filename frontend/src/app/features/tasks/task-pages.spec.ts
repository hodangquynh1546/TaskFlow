import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../core/http/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { TaskCreateComponent } from './create/task-create.component';
import { TaskDetailComponent } from './detail/task-detail.component';
import { TaskEditComponent } from './edit/task-edit.component';
import { TaskFormComponent } from './form/task-form.component';
import { UI_TEST_PROVIDERS, aTask } from './test-support';
import { TaskService } from './task.service';

function setup<T>(component: new () => T, id?: string) {
  const tasks = { get: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), delete: vi.fn() };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  const confirm = { confirmDelete: vi.fn().mockResolvedValue(true) };
  TestBed.configureTestingModule({
    providers: [
      ...UI_TEST_PROVIDERS,
      provideRouter([]),
      { provide: TaskService, useValue: tasks },
      { provide: NotifyService, useValue: notify },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  return {
    tasks, notify, confirm, navigate, navigateByUrl,
    mount: () => {
      const fixture = TestBed.createComponent(component);
      if (id !== undefined) {
        fixture.componentRef.setInput('id', id);
      }
      fixture.detectChanges();
      return fixture;
    },
  };
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) => {
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
};
const formOf = (fixture: ComponentFixture<unknown>): TaskFormComponent =>
  fixture.debugElement.query(By.directive(TaskFormComponent)).componentInstance;
const submitForm = (el: HTMLElement) => el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));

describe('TaskCreateComponent', () => {
  it('creates the task, thanks the user and returns to the list when there is no earlier page', async () => {
    const { mount, tasks, notify, navigateByUrl } = setup(TaskCreateComponent);
    tasks.create.mockReturnValue(of(aTask({ id: 'new-1' })));
    const fixture = mount();

    formOf(fixture)['form'].patchValue({ title: '  Việc mới  ', priority: 'High' });
    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(tasks.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Việc mới', priority: 'High', status: 'Todo', description: null }));
    expect(notify.success).toHaveBeenCalledWith('Đã tạo công việc');
    expect(navigateByUrl).toHaveBeenCalledWith('/tasks', { replaceUrl: true });
  });

  it('after creating, goes back to the page the user came from, not to the new task', async () => {
    const { mount, tasks, navigateByUrl } = setup(TaskCreateComponent);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({ previousNavigation: { finalUrl: router.parseUrl('/schedule?date=2026-11-12') } } as never);
    tasks.create.mockReturnValue(of(aTask({ id: 'new-1' })));
    const fixture = mount();

    formOf(fixture)['form'].patchValue({ title: 'Việc mới' });
    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(navigateByUrl).toHaveBeenCalledWith('/schedule?date=2026-11-12', { replaceUrl: true });
  });

  it('does not call the server for an invalid form', async () => {
    const { mount, tasks } = setup(TaskCreateComponent);
    const fixture = mount();

    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(tasks.create).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Vui lòng nhập tiêu đề.');
  });

  it('shows the server\'s verdict on the form and lets the user fix it and try again', async () => {
    const { mount, tasks, navigate, navigateByUrl } = setup(TaskCreateComponent);
    tasks.create.mockReturnValue(throwError(() => new ApiError(400, 'x', { startDate: ['Ngày bắt đầu không được sau hạn hoàn thành.'] })));
    const fixture = mount();

    formOf(fixture)['form'].patchValue({ title: 'Việc' });
    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Ngày bắt đầu không được sau hạn hoàn thành.');
    expect(navigate).not.toHaveBeenCalled();

    // Fixing the due date (the other half of the rule) must be enough: the stale start-date message goes away too.
    tasks.create.mockReturnValue(of(aTask({ id: 'ok' })));
    formOf(fixture)['form'].patchValue({ dueDate: new Date(2030, 0, 1) });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Ngày bắt đầu không được sau hạn hoàn thành.');
    submitForm(fixture.nativeElement);
    await settle(fixture);
    expect(navigateByUrl).toHaveBeenCalledWith('/tasks', { replaceUrl: true });
  });

  it('ignores a second submit while the first is running', async () => {
    const { mount, tasks } = setup(TaskCreateComponent);
    tasks.create.mockReturnValue(new Subject());
    const fixture = mount();

    formOf(fixture)['form'].patchValue({ title: 'Việc' });
    submitForm(fixture.nativeElement);
    submitForm(fixture.nativeElement);

    expect(tasks.create).toHaveBeenCalledTimes(1);
  });

  it('cancel returns to where the user came from without saving', () => {
    const { mount, tasks, navigateByUrl } = setup(TaskCreateComponent);
    const fixture = mount();

    [...fixture.nativeElement.querySelectorAll('button')].find((b) => (b as HTMLElement).textContent!.trim() === 'Hủy').click();

    expect(navigateByUrl).toHaveBeenCalledWith('/tasks', { replaceUrl: true });
    expect(tasks.create).not.toHaveBeenCalled();
  });

  it('has a back link and a heading', () => {
    const el = setup(TaskCreateComponent).mount().nativeElement as HTMLElement;

    expect(el.querySelector('h1')!.textContent).toBe('Tạo công việc');
    expect(el.querySelector('a.tf-back')!.getAttribute('href')).toBe('/tasks');
  });
});

describe('TaskEditComponent', () => {
  it('loads the task into the form', async () => {
    const { mount, tasks } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask({ title: 'Cần sửa', priority: 'Low' })));
    const fixture = mount();
    await settle(fixture);

    expect(tasks.get).toHaveBeenCalledWith('t1');
    expect(formOf(fixture)['form'].getRawValue()).toMatchObject({ title: 'Cần sửa', priority: 'Low' });
    expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Sửa công việc');
  });

  it('shows a skeleton while loading, not an empty form that could be saved over the real data', () => {
    const { mount, tasks } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(new Subject());
    const el = mount().nativeElement as HTMLElement;

    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('a missing task gets its own explanation, not the generic error', async () => {
    const { mount, tasks } = setup(TaskEditComponent, 'gone');
    tasks.get.mockReturnValue(throwError(() => new ApiError(404, 'Không tìm thấy công việc.')));
    const fixture = mount();
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Không tìm thấy công việc này');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('a load failure offers a retry', async () => {
    const { mount, tasks } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));
    const fixture = mount();
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Không kết nối được máy chủ');

    tasks.get.mockReturnValue(of(aTask({ title: 'Đã có' })));
    fixture.nativeElement.querySelector('[role="alert"] button').click();
    await settle(fixture);

    expect(formOf(fixture)['form'].getRawValue().title).toBe('Đã có');
  });

  it('saves with PUT, thanks the user and returns to the task', async () => {
    const { mount, tasks, notify, navigate } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask()));
    tasks.update.mockReturnValue(of(aTask({ title: 'Mới' })));
    const fixture = mount();
    await settle(fixture);

    formOf(fixture)['form'].patchValue({ title: 'Mới', status: 'Completed' });
    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(tasks.update).toHaveBeenCalledWith('t1', expect.objectContaining({ title: 'Mới', status: 'Completed' }));
    expect(notify.success).toHaveBeenCalledWith('Đã lưu thay đổi');
    expect(navigate).toHaveBeenCalledWith(['/tasks', 't1']);
  });

  it('sends a cleared description as null so it is actually removed', async () => {
    const { mount, tasks } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask({ description: 'cũ' })));
    tasks.update.mockReturnValue(of(aTask()));
    const fixture = mount();
    await settle(fixture);

    formOf(fixture)['form'].patchValue({ description: '' });
    submitForm(fixture.nativeElement);

    expect(tasks.update.mock.calls[0][1].description).toBeNull();
  });

  it('shows server field errors and stays on the form', async () => {
    const { mount, tasks, navigate } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask()));
    tasks.update.mockReturnValue(throwError(() => new ApiError(400, 'x', { title: ['Tiêu đề quá dài.'] })));
    const fixture = mount();
    await settle(fixture);

    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Tiêu đề quá dài.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('if the task was deleted meanwhile, says so and goes to the list', async () => {
    const { mount, tasks, notify, navigateByUrl } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask()));
    tasks.update.mockReturnValue(throwError(() => new ApiError(404, 'Không tìm thấy công việc.')));
    const fixture = mount();
    await settle(fixture);

    submitForm(fixture.nativeElement);
    await settle(fixture);

    expect(notify.error).toHaveBeenCalledWith('Công việc này không còn tồn tại.');
    expect(navigateByUrl).toHaveBeenCalledWith('/tasks');
  });

  it('cancel returns to the task without saving', async () => {
    const { mount, tasks, navigate } = setup(TaskEditComponent, 't1');
    tasks.get.mockReturnValue(of(aTask()));
    const fixture = mount();
    await settle(fixture);

    [...fixture.nativeElement.querySelectorAll('button')].find((b) => (b as HTMLElement).textContent!.trim() === 'Hủy').click();

    expect(navigate).toHaveBeenCalledWith(['/tasks', 't1']);
    expect(tasks.update).not.toHaveBeenCalled();
  });
});

describe('TaskDetailComponent', () => {
  const load = async (task = aTask(), id = 't1') => {
    const ctx = setup(TaskDetailComponent, id);
    ctx.tasks.get.mockReturnValue(of(task));
    const fixture = ctx.mount();
    await settle(fixture);
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  };

  it('shows the title, description, priority, due label and the planned time block', async () => {
    const { el } = await load(aTask({ title: 'Nộp báo cáo', description: 'Dòng 1\nDòng 2', priority: 'High', status: 'InProgress', startDate: new Date(2026, 10, 10, 9, 0).toISOString(), durationMinutes: 90, dueDate: '2030-01-01T10:00:00Z' }));

    expect(el.querySelector('h1')!.textContent).toBe('Nộp báo cáo');
    expect(el.querySelector('.description__text')!.textContent).toBe('Dòng 1\nDòng 2');
    expect(el.querySelector('tf-priority')!.textContent).toContain('Cao');
    expect(el.querySelector('tf-due')).not.toBeNull();
    expect(el.querySelector('tf-time-block')!.textContent).toContain('10/11, 09:00–10:30');
    expect(el.querySelector('tf-time-block')!.textContent).toContain('1 giờ 30 phút');
  });

  it('keeps line breaks in the description', async () => {
    const { el } = await load();

    expect(getComputedStyle(el.querySelector('.description__text')!).whiteSpace).toBe('pre-wrap');
  });

  it('says plainly when there is no description or planned time', async () => {
    const { el } = await load(aTask({ description: null, startDate: null, durationMinutes: null }));

    expect(el.textContent).toContain('Chưa có mô tả.');
    expect(el.textContent).toContain('Chưa xếp giờ');
    expect(el.querySelector('tf-time-block')).toBeNull();
  });

  it('shows when it was created and last updated', async () => {
    const { el } = await load();

    expect(el.querySelector('.stamps')!.textContent).toMatch(/Tạo lúc \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\. Cập nhật lần cuối \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\./);
  });

  it('links to the edit page', async () => {
    const { el } = await load();

    expect(el.querySelector('a[href="/tasks/t1/edit"]')!.textContent).toContain('Sửa');
  });

  it('offers all three statuses with the current one selected', async () => {
    const { el } = await load(aTask({ status: 'InProgress' }));

    expect([...el.querySelectorAll('label[nz-radio-button]')].map((l) => l.textContent!.trim())).toEqual(['Chưa làm', 'Đang làm', 'Hoàn thành']);
    expect(el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toContain('Đang làm');
  });

  describe('changing status', () => {
    it('saves, updates what is shown and tells the user', async () => {
      const { component, tasks, notify, fixture, el } = await (async () => {
        const c = await load();
        return { ...c, component: c.fixture.componentInstance };
      })();
      tasks.changeStatus.mockReturnValue(of(aTask({ status: 'Completed' })));

      component['changeStatus']('Completed');
      await settle(fixture);

      expect(tasks.changeStatus).toHaveBeenCalledWith('t1', 'Completed');
      expect(notify.success).toHaveBeenCalledWith('Đã đánh dấu hoàn thành');
      expect(el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toContain('Hoàn thành');
    });

    it('names the new status in the toast for in-progress and to-do', async () => {
      const { fixture, tasks, notify } = await load();
      tasks.changeStatus.mockReturnValue(of(aTask({ status: 'InProgress' })));

      fixture.componentInstance['changeStatus']('InProgress');
      await settle(fixture);

      expect(notify.success).toHaveBeenCalledWith('Đã chuyển sang Đang làm');
    });

    it('does nothing when the status is already the chosen one', async () => {
      const { fixture, tasks } = await load(aTask({ status: 'Todo' }));

      fixture.componentInstance['changeStatus']('Todo');

      expect(tasks.changeStatus).not.toHaveBeenCalled();
    });

    it('on failure keeps showing the saved status and reports the error', async () => {
      const { fixture, tasks, notify, el } = await load(aTask({ status: 'Todo' }));
      tasks.changeStatus.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

      fixture.componentInstance['changeStatus']('Completed');
      await settle(fixture);

      expect(notify.error).toHaveBeenCalledWith('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
      expect(el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toContain('Chưa làm');
    });

    it('ignores another change while one is in flight', async () => {
      const { fixture, tasks } = await load();
      tasks.changeStatus.mockReturnValue(new Subject());

      fixture.componentInstance['changeStatus']('Completed');
      fixture.componentInstance['changeStatus']('InProgress');

      expect(tasks.changeStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleting', () => {
    it('confirms by name, deletes, thanks the user and returns to the list', async () => {
      const { fixture, tasks, confirm, notify, navigateByUrl } = await load(aTask({ title: 'Việc cần xóa' }));
      tasks.delete.mockReturnValue(of(undefined));

      await fixture.componentInstance['remove']();

      expect(confirm.confirmDelete).toHaveBeenCalledWith('Việc cần xóa');
      expect(tasks.delete).toHaveBeenCalledWith('t1');
      expect(notify.success).toHaveBeenCalledWith('Đã xóa công việc');
      expect(navigateByUrl).toHaveBeenCalledWith('/tasks');
    });

    it('does nothing if the user keeps the task', async () => {
      const { fixture, tasks, confirm, navigateByUrl } = await load();
      confirm.confirmDelete.mockResolvedValue(false);

      await fixture.componentInstance['remove']();

      expect(tasks.delete).not.toHaveBeenCalled();
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('stays on the page and reports a failed delete', async () => {
      const { fixture, tasks, notify, navigateByUrl } = await load();
      tasks.delete.mockReturnValue(throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')));

      await fixture.componentInstance['remove']();

      expect(notify.error).toHaveBeenCalledWith('Có lỗi từ máy chủ. Thử lại sau ít phút.');
      expect(navigateByUrl).not.toHaveBeenCalled();
    });
  });

  describe('loading states', () => {
    it('shows a skeleton while loading', () => {
      const { mount, tasks } = setup(TaskDetailComponent, 't1');
      tasks.get.mockReturnValue(new Subject());

      expect((mount().nativeElement as HTMLElement).querySelector('[aria-busy="true"]')).not.toBeNull();
    });

    it('a missing task gets its own explanation and a way back', async () => {
      const { mount, tasks } = setup(TaskDetailComponent, 'gone');
      tasks.get.mockReturnValue(throwError(() => new ApiError(404, 'Không tìm thấy công việc.')));
      const fixture = mount();
      await settle(fixture);

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Không tìm thấy công việc này');
      expect(el.querySelector('tf-task-missing a[href="/tasks"]')).not.toBeNull();
    });

    it('a load failure shows the error with a retry', async () => {
      const { mount, tasks } = setup(TaskDetailComponent, 't1');
      tasks.get.mockReturnValue(throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')));
      const fixture = mount();
      await settle(fixture);
      tasks.get.mockReturnValue(of(aTask({ title: 'Đã tải được' })));

      fixture.nativeElement.querySelector('[role="alert"] button').click();
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Đã tải được');
    });

    it('loads a different task when the id changes', async () => {
      const { mount, tasks } = setup(TaskDetailComponent, 'a');
      tasks.get.mockImplementation((id: string) => of(aTask({ id, title: `Việc ${id}` })));
      const fixture = mount();
      await settle(fixture);

      fixture.componentRef.setInput('id', 'b');
      await settle(fixture);

      expect(fixture.nativeElement.querySelector('h1').textContent).toBe('Việc b');
    });
  });
});
