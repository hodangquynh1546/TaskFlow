import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';
import { NEVER, Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/http/api-error';
import { DashboardSummary, Task } from '../../shared/models/task.models';
import { DashboardComponent, dayPeriod, describeSituation } from './dashboard.component';
import { DashboardService } from './dashboard.service';

const NOW = Date.now();
const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Việc', description: null, status: 'Todo', priority: 'Medium', startDate: null,
  dueDate: null, durationMinutes: null, isOverdue: false, createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW - 10 * 60_000).toISOString(), ...patch,
});
const summary = (patch: Partial<DashboardSummary> = {}): DashboardSummary => ({ total: 12, todo: 2, inProgress: 2, completed: 8, overdue: 2, ...patch });

function setup(overrides: Partial<Record<'summary' | 'upcoming' | 'recent', unknown>> = {}) {
  const service = {
    summary: vi.fn().mockReturnValue(overrides.summary ?? of(summary())),
    upcoming: vi.fn().mockReturnValue(overrides.upcoming ?? of([])),
    recent: vi.fn().mockReturnValue(overrides.recent ?? of([])),
    report: vi.fn().mockReturnValue(NEVER),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideNzIconsTesting(),
      { provide: DashboardService, useValue: service },
      { provide: AuthService, useValue: { user: signal({ fullName: 'Nguyễn Văn An' }).asReadonly() } },
    ],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(DashboardComponent);
  fixture.detectChanges();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, el: fixture.nativeElement as HTMLElement, service, navigate, settle, text: () => (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('dayPeriod', () => {
  it.each([[0, 'morning'], [5, 'morning'], [11, 'morning'], [12, 'afternoon'], [17, 'afternoon'], [18, 'evening'], [23, 'evening']])('hour %i greets as %s', (hour, expected) => {
    expect(dayPeriod(new Date(2026, 10, 12, hour, 30))).toBe(expected);
  });
});

describe('describeSituation', () => {
  it.each([
    [{ total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0 }, ''],
    [{ total: 5, todo: 0, inProgress: 0, completed: 5, overdue: 0 }, 'Bạn đã hoàn thành mọi công việc. Nghỉ một chút nhé.'],
    [{ total: 12, todo: 2, inProgress: 2, completed: 8, overdue: 0 }, 'Còn 4 việc chưa xong.'],
    [{ total: 12, todo: 2, inProgress: 2, completed: 8, overdue: 3 }, 'Còn 4 việc chưa xong, trong đó 3 đã quá hạn.'],
    [{ total: 1, todo: 1, inProgress: 0, completed: 0, overdue: 1 }, 'Còn 1 việc chưa xong, trong đó 1 đã quá hạn.'],
  ])('%j reads "%s"', (s, expected) => {
    expect(describeSituation(s)).toBe(expected);
  });

  it('counts open work as to-do plus in-progress, never including completed tasks', () => {
    expect(describeSituation({ total: 10, todo: 1, inProgress: 2, completed: 7, overdue: 0 })).toContain('Còn 3 việc');
  });
});

describe('DashboardComponent', () => {
  it('asks the API for the summary, upcoming and recent lists', () => {
    const { service } = setup();

    expect(service.summary).toHaveBeenCalledTimes(1);
    expect(service.upcoming).toHaveBeenCalledTimes(1);
    expect(service.recent).toHaveBeenCalledTimes(1);
  });

  it('shows a loading skeleton, announced to screen readers, until the data arrives', () => {
    const pending = new Subject<DashboardSummary>();
    const { el } = setup({ summary: pending });

    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.textContent).toContain('Đang tải tổng quan');
    expect(el.querySelector('tf-progress-strip')).toBeNull();
  });

  it('greets by given name and states the situation from the real numbers', async () => {
    const { el, settle } = setup();
    await settle();

    expect(el.querySelector('.hello')!.textContent!.trim()).toMatch(/^Chào buổi (sáng|chiều|tối), An!$/);
    expect(el.querySelector('.situation')!.textContent!.trim()).toBe('Còn 4 việc chưa xong, trong đó 2 đã quá hạn.');
  });

  it('shows the completed ratio and the progress strip', async () => {
    const { el, settle } = setup();
    await settle();

    expect(el.querySelector('.stat__figure')!.textContent!.replace(/\s+/g, '')).toBe('8/12');
    expect(el.querySelector('tf-progress-strip')).not.toBeNull();
  });

  it('links the overdue count to the task list filtered to overdue tasks', async () => {
    const { el, settle } = setup();
    await settle();

    expect(el.querySelector('.overdue__text')!.textContent).toContain('2 việc quá hạn');
    expect(el.querySelector('.overdue a')!.getAttribute('href')).toBe('/tasks?overdue=true');
  });

  it('hides the overdue line when nothing is overdue', async () => {
    const { el, settle } = setup({ summary: of(summary({ overdue: 0 })) });
    await settle();

    expect(el.querySelector('.overdue')).toBeNull();
  });

  it('lists upcoming tasks with a link to each and their due label', async () => {
    const due = new Date(NOW + 5.5 * 3_600_000).toISOString(); // half an hour of slack so test timing cannot tip it into 4 hours
    const { el, settle } = setup({ upcoming: of([task({ id: 'u1', title: 'Nộp báo cáo', dueDate: due })]) });
    await settle();

    const link = el.querySelector<HTMLAnchorElement>('section[aria-labelledby="upcoming-title"] a.item__title')!;
    expect(link.textContent).toBe('Nộp báo cáo');
    expect(link.getAttribute('href')).toBe('/tasks/u1');
    expect(el.querySelector('section[aria-labelledby="upcoming-title"] tf-due')!.textContent).toContain('Còn 5 giờ');
  });

  it('says so when nothing is due in the next 7 days', async () => {
    const { el, settle } = setup({ upcoming: of([]) });
    await settle();

    expect(el.textContent).toContain('Không có việc nào đến hạn trong 7 ngày tới.');
  });

  it('lists recently updated tasks with how long ago, including completed ones', async () => {
    const { el, settle } = setup({ recent: of([task({ id: 'r1', title: 'Gửi hóa đơn', status: 'Completed' })]) });
    await settle();

    const row = el.querySelector('section[aria-labelledby="recent-title"] li')!;
    expect(row.textContent).toContain('Gửi hóa đơn');
    expect(row.textContent).toContain('10 phút trước');
  });

  it('with no tasks at all, invites the user to create the first one instead of showing an empty chart', async () => {
    const { el, settle, navigate } = setup({ summary: of(summary({ total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0 })) });
    await settle();

    expect(el.querySelector('tf-progress-strip')).toBeNull();
    expect(el.textContent!.match(/Chưa có công việc nào\./g)).toHaveLength(1); // said once, by the empty state
    el.querySelector<HTMLButtonElement>('tf-empty-state button')!.click();
    expect(navigate).toHaveBeenCalledWith('/tasks/new');
  });

  it('shows an error with a retry that loads everything again', async () => {
    const { el, settle, service, text } = setup({ summary: throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')) });
    await settle();

    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Có lỗi từ máy chủ');

    service.summary.mockReturnValue(of(summary()));
    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    await settle();

    expect(service.summary).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.stat__figure')!.textContent!.replace(/\s+/g, '')).toBe('8/12');
  });

  it('an error in any one of the three requests shows the error state, not a half-empty page', async () => {
    const { el, settle } = setup({ recent: throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')) });
    await settle();

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.querySelector('tf-progress-strip')).toBeNull();
  });
});
