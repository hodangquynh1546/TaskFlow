import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BehaviorSubject, EMPTY, combineLatest, firstValueFrom, forkJoin, from, of, switchMap, tap, toArray } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';

import { ApiError } from '../../core/http/api-error';
import { burstConfetti } from '../../core/motion/confetti';
import { NotifyService } from '../../core/notify/notify.service';
import { ConfirmService } from '../../shared/ui/confirm.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Task, TaskStatus } from '../../shared/models/task.models';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { formatDuration } from '../../shared/util/duration';
import { formatDay, parseDay } from '../tasks/task-query';
import { TaskService } from '../tasks/task.service';
import { blockLabel, clock } from './block-label';
import { DayLayout, HOUR_HEIGHT, PX_PER_MINUTE, SHORT_BLOCK_HEIGHT, ScheduledBlock, VISIBLE_HOURS_DAY, VISIBLE_HOURS_WEEK, fitHourHeight, layoutDay, layoutWeek, snapToQuarter, weekDays } from './schedule-layout';
import { BlockActionsComponent } from '../../shared/ui/block-actions.component';
import { WeekGridComponent } from './week-grid.component';

export { PX_PER_MINUTE };

const MIN_BLOCK_HEIGHT = 26;
/** How long a just-saved task's block stays lit. */
const FLASH_MS = 2400;
/** Matches `.timeline { margin: 16px ... }` and the hour label that sticks out 12px above its line. */
const TIMELINE_MARGIN_TOP = 16;
const HOUR_LABEL_ROOM = 14;
/** The summary line's bottom margin, the week header (3.5rem) and the room the page leaves under the planner. */
const SUMMARY_GAP = 16;
const WEEK_HEADER = 56;
const PAGE_BOTTOM = 56;

interface DayData {
  scheduled: Task[];
  truncated: boolean;
}

@Component({
  selector: 'tf-schedule',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NzButtonModule, NzDatePickerModule, NzIconModule, BlockActionsComponent, ErrorStateComponent, TranslatePipe, WeekGridComponent],
  host: { '(window:resize)': 'fit()', '(document:click)': 'dismissSelection($event)', '(document:keydown.escape)': 'leaveSelecting()' },
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.scss',
})
export class ScheduleComponent {
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly injector = inject(Injector);
  protected readonly i18n = inject(I18nService);

  /** The day shown, "yyyy-MM-dd", bound from the query string by the router. Anything unusable means today. */
  readonly date = input<string>();

  /** "week" shows Monday to Sunday around the day; anything else is the single-day planner. */
  readonly view = input<string>();

  /** True on a device with no hover (a touch screen): there, buttons come from tapping a block. */
  protected readonly touch = signal(window.matchMedia('(hover: none)').matches);

  /** On a touch screen: the block that was tapped once, whose buttons are showing. */
  protected readonly selectedId = signal<string | null>(null);

  /** Several-at-once mode: blocks are picked instead of opened, and the picked ones can be deleted together. */
  protected readonly selecting = signal(false);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly bulkBusy = signal(false);

  /** Ids of the tasks whose status change or deletion is in flight. */
  protected readonly busy = signal<ReadonlySet<string>>(new Set());

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
  /** Pixels per hour: the default, or larger so the visible hours fill a tall window (see fit()). */
  protected readonly hourHeight = signal(HOUR_HEIGHT);
  private readonly pxPerMinute = computed(() => this.hourHeight() / 60);
  private readonly summaryElement = viewChild<ElementRef<HTMLElement>>('summaryLine');
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
  protected readonly gridHeight = computed(() => (this.layout().endHour - this.layout().startHour) * 60 * this.pxPerMinute());

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
    return minute >= startHour * 60 && minute <= endHour * 60 ? (minute - startHour * 60) * this.pxPerMinute() : null;
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
    return first === null ? 0 : Math.max(0, TIMELINE_MARGIN_TOP + first - 60 * this.pxPerMinute());
  });

  constructor() {
    // A week is reloaded only when the week changes, not when the day moves inside it.
    const anchor = computed(() => (this.isWeek() ? `week:${this.week()[0]}` : `day:${this.day()}`));
    combineLatest([toObservable(anchor), this.reload$])
      .pipe(
        tap(() => {
          this.state.set('loading');
          this.selectedId.set(null);
          this.picked.set(new Set());
        }),
        switchMap(([key]) => {
          const day = key.slice(key.indexOf(':') + 1);
          this.direction.set(this.lastDay && day < this.lastDay ? -1 : 1);
          this.lastDay = day;
          const days = untracked(() => this.week());
          const load = key.startsWith('week:')
            // The server returns at most 50 tasks per request, so a week is seven days of up to 50 each.
            ? forkJoin(days.map((d) => this.tasks.forDay(d))).pipe(
                map((results) => ({ items: results.flatMap((r) => r.items), totalCount: results.reduce((sum, r) => sum + r.totalCount, 0) })),
              )
            : this.tasks.forDay(day);
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
      .subscribe((scheduled) => {
        this.data.set({ scheduled: scheduled.items, truncated: scheduled.totalCount > scheduled.items.length });
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

    afterNextRender(() => this.fit(), { injector: this.injector });
    effect(() => {
      this.isWeek();
      afterNextRender(() => this.fit(), { injector: this.injector });
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

  /**
   * A tap on a block. With a mouse the link just opens the task (the buttons come from hovering). On a touch screen
   * there is no hover, so the first tap only shows the buttons and a second tap on the same block opens the task.
   */
  protected tapBlock(id: string): void {
    if (this.selecting()) {
      this.togglePick(id);
      return;
    }
    if (this.touch() && this.selectedId() !== id) {
      this.selectedId.set(id);
    }
  }

  /**
   * Where a block leads. On a touch screen a block that has not been tapped yet leads nowhere (no link at all: a
   * RouterLink navigates whatever a click handler does), so the first tap can only show its buttons.
   */
  protected link(id: string): string[] | null {
    // Picking several: a block is only something to pick, so it leads nowhere.
    return this.selecting() || (this.touch() && this.selectedId() !== id) ? null : ['/tasks', id];
  }

  protected toggleSelecting(): void {
    this.selecting.update((on) => !on);
    this.picked.set(new Set());
    this.selectedId.set(null);
  }

  protected leaveSelecting(): void {
    if (this.selecting() && !this.bulkBusy()) {
      this.toggleSelecting();
    }
  }

  protected togglePick(id: string): void {
    if (this.bulkBusy()) {
      return;
    }
    this.picked.update((set) => {
      const next = new Set(set);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected pickAll(): void {
    this.picked.set(new Set((this.data()?.scheduled ?? []).map((t) => t.id)));
  }

  protected clearPicks(): void {
    this.picked.set(new Set());
  }

  protected readonly hasTasks = computed(() => (this.data()?.scheduled.length ?? 0) > 0);

  /**
   * Deletes every picked task after one confirmation. The server has no "delete many", so each goes on its own, a few at
   * a time; the ones that worked leave the planner, the ones that did not stay picked so the user can try again.
   */
  protected async deletePicked(): Promise<void> {
    const ids = [...this.picked()];
    if (ids.length === 0 || this.bulkBusy() || !(await this.confirm.confirmDeleteMany(ids.length))) {
      return;
    }
    this.bulkBusy.set(true);
    const results = await firstValueFrom(
      from(ids).pipe(
        mergeMap((id) => this.tasks.delete(id).pipe(map(() => ({ id, ok: true })), catchError(() => of({ id, ok: false }))), 5),
        toArray(),
      ),
    );
    const gone = new Set(results.filter((r) => r.ok).map((r) => r.id));
    const failed = results.length - gone.size;
    this.data.update((d) => d && { ...d, scheduled: d.scheduled.filter((t) => !gone.has(t.id)) });
    this.picked.set(new Set(results.filter((r) => !r.ok).map((r) => r.id)));
    this.bulkBusy.set(false);
    if (gone.size > 0) {
      this.notify.success(this.i18n.t('toast.deletedMany', { count: gone.size }));
    }
    if (failed > 0) {
      this.notify.error(this.i18n.t('toast.deleteManyFailed', { count: failed }));
    }
  }

  /** A tap anywhere that is not a block or its buttons puts the buttons away again. */
  protected dismissSelection(event: Event): void {
    if (this.selectedId() !== null && !(event.target as Element | null)?.closest('a.block, tf-block-actions')) {
      this.selectedId.set(null);
    }
  }

  protected isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  /** Yellow or green button on a block. Pressing the one the task already has puts it back to "to do". */
  protected chooseStatus(task: Task, pressed: TaskStatus, event?: Event): void {
    if (this.isBusy(task.id)) {
      return;
    }
    const status: TaskStatus = task.status === pressed ? 'Todo' : pressed;
    this.markBusy(task.id, true);
    this.tasks.changeStatus(task.id, status).subscribe({
      next: (changed) => {
        this.markBusy(task.id, false);
        // Changed in place: reloading would blink the planner and throw away where the user had scrolled to.
        this.data.update((d) => d && { ...d, scheduled: d.scheduled.map((t) => (t.id === changed.id ? changed : t)) });
        this.notify.success(
          changed.next
            ? this.i18n.t('toast.nextCreated', { when: this.i18n.formatDateTime(changed.next.startDate) })
            : this.i18n.t(status === 'Completed' ? 'toast.completed' : status === 'InProgress' ? 'toast.toDoing' : 'toast.toTodo'),
        );
        if (status === 'Completed') {
          const box = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect();
          burstConfetti(box && { x: box.left + box.width / 2, y: box.top + box.height / 2 });
        }
      },
      error: (error: ApiError) => {
        this.markBusy(task.id, false);
        this.notify.error(error.message);
      },
    });
  }

  /** Red button on a block: the same confirmation as deleting from the list. */
  protected async remove(task: Task): Promise<void> {
    if (this.isBusy(task.id) || !(await this.confirm.confirmDelete(task.title))) {
      return;
    }
    this.markBusy(task.id, true);
    this.tasks.delete(task.id).subscribe({
      next: () => {
        this.markBusy(task.id, false);
        this.data.update((d) => d && { ...d, scheduled: d.scheduled.filter((t) => t.id !== task.id) });
        this.notify.success(this.i18n.t('toast.deleted'));
      },
      error: (error: ApiError) => {
        this.markBusy(task.id, false);
        this.notify.error(error.message);
      },
    });
  }

  private markBusy(id: string, busy: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  /**
   * Sizes the hours so the visible ones (8 in the day view, 7 in the week) reach the bottom of the window instead of
   * leaving a blank strip under the planner on a tall one. Measured from the summary line just above the planner.
   * Phones keep the default: the page scrolls there. Where nothing is laid out (tests) the default stays too.
   */
  protected fit(): void {
    const top = this.summaryElement()?.nativeElement.getBoundingClientRect().bottom ?? 0;
    if (top <= 0 || window.innerWidth < 1024) {
      this.hourHeight.set(HOUR_HEIGHT);
      return;
    }
    const week = this.isWeek();
    // Below the summary: its margin, the panel's own 16px of top margin, the week header, and the page's bottom padding.
    const fixed = SUMMARY_GAP + TIMELINE_MARGIN_TOP + (week ? WEEK_HEADER : 0);
    this.hourHeight.set(fitHourHeight(window.innerHeight - top - PAGE_BOTTOM, week ? VISIBLE_HOURS_WEEK : VISIBLE_HOURS_DAY, fixed));
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
    return (block.startMinute - this.layout().startHour * 60) * this.pxPerMinute();
  }

  protected height(block: ScheduledBlock): number {
    return Math.max((block.endMinute - block.startMinute) * this.pxPerMinute(), MIN_BLOCK_HEIGHT);
  }

  /** Too short for two lines: the title and the time share one row so neither is cut off. */
  protected isShort(block: ScheduledBlock): boolean {
    return this.height(block) < SHORT_BLOCK_HEIGHT;
  }

  protected hourTop(hour: number): number {
    return (hour - this.layout().startHour) * 60 * this.pxPerMinute();
  }

  protected label(block: ScheduledBlock): string {
    return blockLabel(block, (k, p) => this.i18n.t(k, p));
  }

  protected clock = clock;

  private goTo(day: string): void {
    void this.router.navigate([], { queryParams: { date: day === this.today() ? null : day }, queryParamsHandling: 'merge' });
  }
}
