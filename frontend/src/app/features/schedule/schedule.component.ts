import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BehaviorSubject, EMPTY, combineLatest, forkJoin, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiError } from '../../core/http/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { STATUS_KEYS, Task } from '../../shared/models/task.models';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { StatusIndicatorComponent } from '../../shared/ui/status-indicator.component';
import { DueLabelComponent } from '../../shared/ui/due-label.component';
import { formatDuration } from '../../shared/util/duration';
import { formatDay, parseDay } from '../tasks/task-query';
import { TaskService } from '../tasks/task.service';
import { DayLayout, ScheduledBlock, layoutDay, snapToQuarter } from './schedule-layout';

/** Pixels per minute on the timeline: an hour is 84px tall, so a 15 minute block is still readable. */
export const PX_PER_MINUTE = 1.4;
const MIN_BLOCK_HEIGHT = 26;

const pad = (n: number): string => String(n).padStart(2, '0');
const clock = (minute: number): string => `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;

interface DayData {
  scheduled: Task[];
  unscheduledDue: Task[];
  truncated: boolean;
}

@Component({
  selector: 'tf-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NzButtonModule, NzDatePickerModule, NzIconModule, DueLabelComponent, ErrorStateComponent, StatusIndicatorComponent, TranslatePipe],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
})
export class ScheduleComponent {
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18nService);

  /** The day shown, "yyyy-MM-dd", bound from the query string by the router. Anything unusable means today. */
  readonly date = input<string>();

  protected readonly today = signal(formatDay(new Date()));
  protected readonly day = computed(() => {
    const requested = this.date();
    return requested && formatDay(parseDay(requested)) === requested ? requested : this.today();
  });
  protected readonly isToday = computed(() => this.day() === this.today());
  protected readonly selected = computed(() => parseDay(this.day()));

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly data = signal<DayData | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly now = signal(new Date());
  /** -1 when the user went to an earlier day, 1 for a later one: blocks slide in from that side. */
  protected readonly direction = signal(1);
  private lastDay = '';

  protected readonly layout = computed<DayLayout>(() => layoutDay(this.data()?.scheduled ?? []));
  protected readonly hours = computed(() => {
    const { startHour, endHour } = this.layout();
    return Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  });
  protected readonly gridHeight = computed(() => (this.layout().endHour - this.layout().startHour) * 60 * PX_PER_MINUTE);

  /** "Planned 5 h 30 min across 6 tasks." plus a note when blocks overlap. */
  protected readonly summary = computed(() => {
    const d = this.data();
    if (!d) {
      return '';
    }
    const { plannedMinutes, conflicts } = this.layout();
    if (d.scheduled.length === 0) {
      return this.i18n.t('schedule.summaryNone');
    }
    const count = d.scheduled.length;
    const planned = plannedMinutes > 0
      ? this.i18n.t('schedule.summaryPlanned', { duration: formatDuration(plannedMinutes, (k, p) => this.i18n.t(k, p)), count })
      : this.i18n.t('schedule.summaryScheduled', { count });
    return conflicts > 0 ? `${planned} ${this.i18n.t('schedule.summaryConflicts', { n: conflicts })}` : planned;
  });

  /** The red "now" line, only while looking at today and inside the visible hours. */
  protected readonly nowTop = computed(() => {
    if (!this.isToday()) {
      return null;
    }
    const minute = this.now().getHours() * 60 + this.now().getMinutes();
    const { startHour, endHour } = this.layout();
    return minute >= startHour * 60 && minute <= endHour * 60 ? (minute - startHour * 60) * PX_PER_MINUTE : null;
  });

  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  /** Where the timeline should open: an hour before the first task, or before "now" when looking at today. */
  protected readonly focusTop = computed(() => {
    const layout = this.layout();
    const first = layout.blocks.length ? Math.min(...layout.blocks.map((b) => this.top(b))) : null;
    const target = this.isToday() && this.nowTop() !== null ? Math.min(this.nowTop()!, first ?? Infinity) : first;
    return target === null ? 0 : Math.max(0, target - 60 * PX_PER_MINUTE);
  });

  constructor() {
    combineLatest([toObservable(this.day), this.reload$])
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(([day]) => {
          this.direction.set(this.lastDay && day < this.lastDay ? -1 : 1);
          this.lastDay = day;
          return forkJoin({ scheduled: this.tasks.forDay(day), due: this.tasks.dueOn(day) }).pipe(
            catchError((error: ApiError) => {
              this.error.set(error);
              this.state.set('error');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ scheduled, due }) => {
        this.data.set({
          scheduled: scheduled.items,
          // Due that day, open, and not on the timeline yet: these still need a time.
          unscheduledDue: due.items.filter((t) => t.startDate === null && t.status !== 'Completed'),
          truncated: scheduled.totalCount > scheduled.items.length,
        });
        this.error.set(null);
        this.state.set('ready');
      });

    // Opens on the part of the day that matters instead of at 06:00. Runs when a day's data arrives, not on every tick.
    effect(() => {
      if (this.state() !== 'ready') {
        return;
      }
      const target = this.focusTop();
      afterNextRender(() => {
        const element = this.scroller()?.nativeElement;
        if (element) {
          element.scrollTop = target;
        }
      }, { injector: this.injector });
    });

    // Keeps the "now" line and "today" honest while the page stays open, including across midnight.
    const timer = setInterval(() => {
      this.now.set(new Date());
      this.today.set(formatDay(new Date()));
    }, 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected shift(days: number): void {
    const next = parseDay(this.day());
    next.setDate(next.getDate() + days);
    this.goTo(formatDay(next));
  }

  protected goToday(): void {
    this.goTo(this.today());
  }

  protected pick(date: Date | null): void {
    if (date) {
      this.goTo(formatDay(date));
    }
  }

  protected retry(): void {
    this.reload$.next();
  }

  /** Starting a task from a free slot: the new-task form opens already set to that day and time. */
  protected createAt(minute: number | null): void {
    const queryParams: Record<string, string> = { date: this.day() };
    if (minute !== null) {
      queryParams['time'] = clock(snapToQuarter(minute));
    }
    void this.router.navigate(['/tasks/new'], { queryParams });
  }

  protected top(block: ScheduledBlock): number {
    return (block.startMinute - this.layout().startHour * 60) * PX_PER_MINUTE;
  }

  protected height(block: ScheduledBlock): number {
    return Math.max((block.endMinute - block.startMinute) * PX_PER_MINUTE, MIN_BLOCK_HEIGHT);
  }

  /** Too short for two lines: the title and the time share one row so neither is cut off. */
  protected isShort(block: ScheduledBlock): boolean {
    return this.height(block) < 36;
  }

  protected hourTop(hour: number): number {
    return (hour - this.layout().startHour) * 60 * PX_PER_MINUTE;
  }

  protected label(block: ScheduledBlock): string {
    const t = block.task;
    const length = t.durationMinutes === null ? this.i18n.t('schedule.noLength') : formatDuration(t.durationMinutes, (k, p) => this.i18n.t(k, p));
    return this.i18n.t('schedule.blockLabel', { title: t.title, from: clock(block.startMinute), to: clock(block.endMinute), length, status: this.i18n.t(STATUS_KEYS[t.status]) });
  }

  protected clock = clock;

  private goTo(day: string): void {
    void this.router.navigate([], { queryParams: { date: day === this.today() ? null : day }, queryParamsHandling: 'merge' });
  }
}
