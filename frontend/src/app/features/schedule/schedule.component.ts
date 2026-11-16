import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BehaviorSubject, EMPTY, combineLatest, forkJoin, switchMap, tap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { ApiError } from '../../core/http/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Task } from '../../shared/models/task.models';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { StatusIndicatorComponent } from '../../shared/ui/status-indicator.component';
import { DueLabelComponent } from '../../shared/ui/due-label.component';
import { formatDuration } from '../../shared/util/duration';
import { formatDay, parseDay } from '../tasks/task-query';
import { TaskService } from '../tasks/task.service';
import { blockLabel, clock } from './block-label';
import { DayLayout, PX_PER_MINUTE, ScheduledBlock, layoutDay, layoutWeek, snapToQuarter, weekDays } from './schedule-layout';
import { WeekGridComponent } from './week-grid.component';

export { PX_PER_MINUTE };

const MIN_BLOCK_HEIGHT = 26;
/** How long a just-saved task's block stays lit. */
const FLASH_MS = 2400;
/** Matches `.timeline { margin: 16px ... }` and the hour label that sticks out 12px above its line. */
const TIMELINE_MARGIN_TOP = 16;
const HOUR_LABEL_ROOM = 14;

interface DayData {
  scheduled: Task[];
  unscheduledDue: Task[];
  truncated: boolean;
}

@Component({
  selector: 'tf-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NzButtonModule, NzDatePickerModule, NzIconModule, DueLabelComponent, ErrorStateComponent, StatusIndicatorComponent, TranslatePipe, WeekGridComponent],
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

  /** "week" shows Monday to Sunday around the day; anything else is the single-day planner. */
  readonly view = input<string>();

  /** A task to point at: set after saving one from here, so the planner scrolls to its block. */
  readonly highlight = input<string>();
  protected readonly flashId = signal<string | null>(null);
  private flashTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly today = signal(formatDay(new Date()));
  protected readonly day = computed(() => {
    const requested = this.date();
    return requested && formatDay(parseDay(requested)) === requested ? requested : this.today();
  });
  protected readonly isToday = computed(() => this.day() === this.today());
  protected readonly selected = computed(() => parseDay(this.day()));
  /** True when the screen already shows today: the day itself, or the week that contains it. */
  protected readonly atToday = computed(() => (this.isWeek() ? this.week().includes(this.today()) : this.isToday()));
  protected readonly isWeek = computed(() => this.view() === 'week');
  protected readonly week = computed(() => weekDays(this.day()));
  protected readonly weekLayouts = computed(() => layoutWeek(this.week(), this.data()?.scheduled ?? []));
  protected readonly weekRange = computed(() => {
    const days = this.week();
    const locale = this.i18n.locale();
    const from = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(parseDay(days[0]));
    const to = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', year: 'numeric' }).format(parseDay(days[6]));
    return this.i18n.t('schedule.weekRange', { from, to });
  });

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

  /** "Planned 5 h 30 min across 6 tasks." plus a note when blocks overlap. In week view, the whole week's totals. */
  protected readonly summary = computed(() => {
    const d = this.data();
    if (!d) {
      return '';
    }
    const layouts = this.isWeek() ? this.weekLayouts() : [this.layout()];
    const plannedMinutes = layouts.reduce((sum, l) => sum + l.plannedMinutes, 0);
    const conflicts = layouts.reduce((sum, l) => sum + l.conflicts, 0);
    if (d.scheduled.length === 0) {
      return this.i18n.t(this.isWeek() ? 'schedule.summaryNoneWeek' : 'schedule.summaryNone');
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

  /**
   * Where the timeline opens. Today: the current hour is the first line, so what is happening now is in view without
   * scrolling. Any other day: an hour before the first task. In pixels of scroll, counting the timeline's top margin.
   */
  protected readonly focusTop = computed(() => {
    const { blocks } = this.layout();
    if (this.isToday()) {
      // The axis is the whole day, so the current hour is always on it. Near midnight the scroll simply stops at the end.
      return Math.max(0, TIMELINE_MARGIN_TOP + this.hourTop(this.now().getHours()) - HOUR_LABEL_ROOM);
    }
    const first = blocks.length ? Math.min(...blocks.map((b) => this.top(b))) : null;
    return first === null ? 0 : Math.max(0, TIMELINE_MARGIN_TOP + first - 60 * PX_PER_MINUTE);
  });

  constructor() {
    // A week is reloaded only when the week changes, not when the day moves inside it.
    const anchor = computed(() => (this.isWeek() ? `week:${this.week()[0]}` : `day:${this.day()}`));
    combineLatest([toObservable(anchor), this.reload$])
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(([key]) => {
          const day = key.slice(key.indexOf(':') + 1);
          this.direction.set(this.lastDay && day < this.lastDay ? -1 : 1);
          this.lastDay = day;
          const days = untracked(() => this.week());
          const load = key.startsWith('week:')
            // The server returns at most 50 tasks per request, so a week is seven days of up to 50 each.
            ? forkJoin({ days: forkJoin(days.map((d) => this.tasks.forDay(d))), due: this.tasks.dueBetween(days[0], days[6]) }).pipe(
                map(({ days: results, due }) => ({
                  scheduled: { items: results.flatMap((r) => r.items), totalCount: results.reduce((sum, r) => sum + r.totalCount, 0) },
                  due,
                })),
              )
            : forkJoin({ scheduled: this.tasks.forDay(day), due: this.tasks.dueOn(day) });
          return load.pipe(
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

    // Opens on the part of the day that matters instead of at midnight. Runs when a day's data arrives, not on every
    // minute tick: reading the target untracked keeps the clock from yanking the scroll away from the user.
    effect(() => {
      if (this.state() !== 'ready') {
        return;
      }
      // Everything but the state is read untracked: removing the highlight from the address afterwards must not
      // make this run again and scroll the planner back to its usual place.
      if (untracked(() => this.isWeek())) {
        // The week grid scrolls itself; all that is left to do here is to light the block and clear the address.
        const pointedAt = untracked(() => this.highlight());
        if (pointedAt) {
          this.flash(untracked(() => this.weekLayouts().some((l) => l.blocks.some((b) => b.task.id === pointedAt))) ? pointedAt : null);
        }
        return;
      }
      const { pointedAt, target, block } = untracked(() => {
        const pointedAt = this.highlight();
        const found = pointedAt ? this.layout().blocks.find((b) => b.task.id === pointedAt) : undefined;
        return { pointedAt, target: this.focusTop(), block: found };
      });
      afterNextRender(() => {
        const element = this.scroller()?.nativeElement;
        if (!element) {
          return;
        }
        // The block's middle goes to the middle of the visible part; otherwise the usual opening position.
        element.scrollTop = block
          ? Math.max(0, TIMELINE_MARGIN_TOP + this.top(block) + this.height(block) / 2 - element.clientHeight / 2)
          : target;
      }, { injector: this.injector });
      if (pointedAt) {
        this.flash(block?.task.id ?? null);
      }
    });

    // Keeps the "now" line and "today" honest while the page stays open, including across midnight.
    const timer = setInterval(() => {
      this.now.set(new Date());
      this.today.set(formatDay(new Date()));
    }, 60_000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      clearTimeout(this.flashTimer);
    });
  }

  /** Lights the block for a moment, then removes the request from the address so a reload does not repeat it. */
  private flash(id: string | null): void {
    if (id) {
      this.flashId.set(id);
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => this.flashId.set(null), FLASH_MS);
    }
    void this.router.navigate([], { queryParams: { highlight: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected shift(steps: number): void {
    const next = parseDay(this.day());
    next.setDate(next.getDate() + steps * (this.isWeek() ? 7 : 1));
    this.goTo(formatDay(next));
  }

  protected setView(view: 'day' | 'week'): void {
    void this.router.navigate([], { queryParams: { view: view === 'week' ? 'week' : null }, queryParamsHandling: 'merge' });
  }

  /** A free slot in the week grid: the new-task form opens set to that column's day and hour. */
  protected createOn(slot: { day: string; minute: number }): void {
    void this.router.navigate(['/tasks/new'], { queryParams: { date: slot.day, time: clock(snapToQuarter(slot.minute)) } });
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
    return blockLabel(block, (k, p) => this.i18n.t(k, p));
  }

  protected clock = clock;

  private goTo(day: string): void {
    void this.router.navigate([], { queryParams: { date: day === this.today() ? null : day }, queryParamsHandling: 'merge' });
  }
}
