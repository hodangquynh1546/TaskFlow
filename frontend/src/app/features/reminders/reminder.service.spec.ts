import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth/auth.service';
import { SystemNotice, SystemNotifier } from '../../core/notify/system-notifier';
import { TaskService } from '../tasks/task.service';
import { ReminderService } from './reminder.service';

const NOW = new Date(2026, 10, 16, 8, 56);
const at = (h: number, m = 0) => new Date(2026, 10, 16, h, m).toISOString();
const task = (patch: Record<string, unknown> = {}) => ({ id: 't1', title: 'Họp nhóm', status: 'Todo', priority: 'Medium', startDate: at(9), ...patch });

function setup(options: { permission?: string; items?: unknown[]; signedIn?: boolean } = {}) {
  localStorage.clear();
  const shown: SystemNotice[] = [];
  const notifier = { permission: vi.fn().mockReturnValue(options.permission ?? 'granted'), show: (n: SystemNotice) => shown.push(n) };
  const tasks = { startingBetween: vi.fn().mockReturnValue(of({ items: options.items ?? [task()] })) };
  const signedIn = signal(options.signedIn ?? false);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: SystemNotifier, useValue: notifier },
      { provide: TaskService, useValue: tasks },
      { provide: AuthService, useValue: { isSignedIn: signedIn.asReadonly() } },
    ],
  });
  return { service: TestBed.inject(ReminderService), notifier, tasks, shown, signedIn };
}

describe('ReminderService', () => {
  afterEach(() => vi.useRealTimers());

  it('announces a task whose time has come, with its title and when it starts', async () => {
    const { service, shown } = setup();

    await service.check(NOW);

    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Họp nhóm');
    expect(shown[0].body).toBe('Bắt đầu lúc 09:00, còn 4 phút');
  });

  it('says it is time when the start is already here', async () => {
    const { service, shown } = setup();

    await service.check(new Date(2026, 10, 16, 9, 1));

    expect(shown[0].body).toBe('Đã đến giờ bắt đầu: 09:00');
  });

  it('looks only at the window that matters: a little back and the longest lead ahead', async () => {
    const { service, tasks } = setup();

    await service.check(NOW);

    const [from, to] = tasks.startingBetween.mock.calls[0] as [Date, Date];
    expect(NOW.getTime() - from.getTime()).toBe(10 * 60_000);
    expect(to.getTime() - NOW.getTime()).toBe(15 * 60_000);
  });

  it('never says the same thing twice, not even after a reload (it remembers)', async () => {
    const first = setup();
    await first.service.check(NOW);
    await first.service.check(new Date(NOW.getTime() + 30_000));
    expect(first.shown).toHaveLength(1);

    const stored = localStorage.getItem('tf.reminded')!;
    TestBed.resetTestingModule();
    const second = setup();
    localStorage.setItem('tf.reminded', stored);
    await second.service.check(new Date(NOW.getTime() + 60_000));

    expect(second.shown).toHaveLength(0);
  });

  it('a task moved to another time is announced again for its new time', async () => {
    const { service, shown, tasks } = setup();
    await service.check(NOW);

    tasks.startingBetween.mockReturnValue(of({ items: [task({ startDate: at(9, 10) })] }));
    await service.check(new Date(2026, 10, 16, 9, 6));

    expect(shown).toHaveLength(2);
  });

  it.each([
    [{ priority: 'Low' }],
    [{ status: 'InProgress' }],
    [{ status: 'Completed' }],
    [{ startDate: null }],
  ])('does not announce %j', async (patch) => {
    const { service, shown } = setup({ items: [task(patch)] });

    await service.check(NOW);

    expect(shown).toHaveLength(0);
  });

  it('a high priority task is announced a quarter of an hour ahead, and not earlier', async () => {
    const { service, shown } = setup({ items: [task({ priority: 'High' })] });

    await service.check(new Date(2026, 10, 16, 8, 44));
    expect(shown).toHaveLength(0);

    await service.check(new Date(2026, 10, 16, 8, 45));
    expect(shown).toHaveLength(1);
  });

  it('asks for nothing and announces nothing unless notifications are allowed', async () => {
    for (const permission of ['default', 'denied', 'unsupported']) {
      TestBed.resetTestingModule();
      const { service, tasks, shown } = setup({ permission });

      await service.check(NOW);

      expect(tasks.startingBetween).not.toHaveBeenCalled();
      expect(shown).toHaveLength(0);
    }
  });

  it('a failed request is not an error: the next check tries again', async () => {
    const { service, tasks, shown } = setup();
    tasks.startingBetween.mockReturnValueOnce(throwError(() => new Error('offline')));

    await service.check(NOW);
    await service.check(NOW);

    expect(shown).toHaveLength(1);
  });

  it('clicking a notice opens that task', async () => {
    const { service, shown } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    await service.check(NOW);

    shown[0].onClick();

    expect(navigate).toHaveBeenCalledWith(['/tasks', 't1']);
  });

  it('brings the Mac app window back from the menu bar when a notice is clicked', async () => {
    const showWindow = vi.fn();
    vi.stubGlobal('taskflowDesktop', { showWindow });
    const { service, shown } = setup();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(window, 'focus').mockImplementation(() => undefined);
    await service.check(NOW);

    shown[0].onClick();

    expect(showWindow).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('checks every half minute while someone is signed in, and stops when they sign out', async () => {
    vi.useFakeTimers();
    const { tasks, signedIn } = setup();
    TestBed.tick();
    expect(tasks.startingBetween).not.toHaveBeenCalled();

    signedIn.set(true);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    const first = tasks.startingBetween.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tasks.startingBetween.mock.calls.length).toBe(first + 2);

    signedIn.set(false);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tasks.startingBetween.mock.calls.length).toBe(first + 2);
  });
});
