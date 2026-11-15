import { DestroyRef, Injectable, effect, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { desktopBridge } from '../../core/desktop';
import { I18nService } from '../../core/i18n/i18n.service';
import { SystemNotifier } from '../../core/notify/system-notifier';
import { Task } from '../../shared/models/task.models';
import { formatClock } from '../../shared/util/duration';
import { REMINDER_GRACE_MINUTES, REMINDER_LOOKAHEAD_MINUTES, dueReminders, reminderKey } from '../../shared/util/reminder';
import { TaskService } from '../tasks/task.service';

const STORAGE_KEY = 'tf.reminded';
const CHECK_EVERY_MS = 30_000;
const MINUTE = 60_000;
/** Memory of what was announced is kept this long, so it cannot grow for ever. */
const REMEMBER_MS = 2 * 24 * 60 * MINUTE;

/**
 * Announces tasks that are about to start, with the system's own notifications. It looks every half minute at the few
 * tasks starting soon (never the whole list) and remembers what it announced, so a reload or a restart does not repeat
 * it. It runs as long as the page does: in the Mac app that is also while the window is tucked away in the menu bar.
 */
@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly auth = inject(AuthService);
  private readonly tasks = inject(TaskService);
  private readonly notifier = inject(SystemNotifier);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  private timer: ReturnType<typeof setInterval> | undefined;
  private checking = false;

  constructor() {
    effect(() => {
      if (this.auth.isSignedIn()) {
        this.start();
      } else {
        this.stop();
      }
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** One look at what is about to start. Public so it can also run when the page comes back into view. */
  async check(now: Date = new Date()): Promise<void> {
    if (this.checking || this.notifier.permission() !== 'granted') {
      return;
    }
    this.checking = true;
    try {
      const from = new Date(now.getTime() - REMINDER_GRACE_MINUTES * MINUTE);
      const to = new Date(now.getTime() + REMINDER_LOOKAHEAD_MINUTES * MINUTE);
      const page = await new Promise<{ items: Task[] }>((resolve, reject) => this.tasks.startingBetween(from, to).subscribe({ next: resolve, error: reject }));

      const remembered = this.remembered(now);
      for (const task of dueReminders(page.items, now, new Set(Object.keys(remembered)))) {
        remembered[reminderKey(task)] = now.getTime();
        this.announce(task, now);
      }
      this.remember(remembered);
    } catch {
      // Offline or the server is busy: the next check tries again.
    } finally {
      this.checking = false;
    }
  }

  private start(): void {
    if (this.timer !== undefined) {
      return;
    }
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  private stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private announce(task: Task, now: Date): void {
    const start = new Date(task.startDate!);
    const minutes = Math.ceil((start.getTime() - now.getTime()) / MINUTE);
    const time = formatClock(start);
    this.notifier.show({
      title: task.title,
      body: minutes > 0 ? this.i18n.t('reminder.body', { time, n: minutes }) : this.i18n.t('reminder.now', { time }),
      tag: reminderKey(task),
      onClick: () => {
        desktopBridge()?.showWindow();
        window.focus();
        void this.router.navigate(['/tasks', task.id]);
      },
    });
  }

  private remembered(now: Date): Record<string, number> {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
      return Object.fromEntries(Object.entries(stored).filter(([, at]) => typeof at === 'number' && now.getTime() - at < REMEMBER_MS));
    } catch {
      return {};
    }
  }

  private remember(remembered: Record<string, number>): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remembered));
    } catch {
      // Storage is unavailable: this visit still will not repeat itself, a later one might.
    }
  }
}
