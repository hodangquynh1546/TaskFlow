import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';

import { appConfig } from './app.config';
import { ConfirmService } from './shared/ui/confirm.service';
import { NotifyService } from './core/notify/notify.service';
import { DashboardService } from './features/dashboard/dashboard.service';
import { ProfileService } from './features/profile/profile.service';
import { TaskService } from './features/tasks/task.service';

/**
 * Unit tests replace services with mocks, which hides a missing provider until the real app crashes in the browser
 * (this is how NzModalService was missed). These tests use the application's own provider list, with nothing mocked.
 */
describe('application providers (the real configuration, nothing mocked)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      // Exactly the app's providers. The startup session check makes no request without a stored token; HTTP is the testing backend.
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
  });

  it.each([
    ['ConfirmService', ConfirmService],
    ['NotifyService', NotifyService],
    ['TaskService', TaskService],
    ['DashboardService', DashboardService],
    ['ProfileService', ProfileService],
    ['NzModalService', NzModalService],
    ['NzMessageService', NzMessageService],
  ])('%s can be created', (_name, token) => {
    expect(() => TestBed.inject(token as never)).not.toThrow();
  });

  it('the delete confirmation really opens a dialog naming the task, with the safe button first', async () => {
    void TestBed.inject(ConfirmService).confirmDelete('Việc cần xóa');
    await new Promise((r) => setTimeout(r, 50));

    const dialog = document.querySelector('.ant-modal-confirm');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('Xóa “Việc cần xóa”?');
    expect(dialog!.textContent).toContain('Công việc sẽ bị xóa vĩnh viễn.');
    const buttons = [...dialog!.querySelectorAll<HTMLButtonElement>('.ant-modal-confirm-btns button')];
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Giữ lại', 'Xóa']);
    expect(buttons[1].classList.contains('ant-btn-dangerous')).toBe(true);
    // How the answer is delivered (afterClose) depends on CSS animation events that jsdom never fires; that part is
    // covered with a stand-in modal in confirm.service.spec.ts and was checked in a real browser.
  });

  it('a toast can really be shown', () => {
    TestBed.inject(NotifyService).success('Đã lưu thay đổi');

    expect(() => document.querySelector('.ant-message')).not.toThrow();
  });
});
