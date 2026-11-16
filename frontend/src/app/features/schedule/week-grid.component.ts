import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { I18nService } from '../../core/i18n/i18n.service';
import { parseDay } from '../tasks/task-query';
import { blockLabel, clock } from './block-label';
import { DayLayout, DEFAULT_END_HOUR, DEFAULT_START_HOUR, PX_PER_MINUTE, ScheduledBlock } from './schedule-layout';

/** Matches the top margin of a column and the hour label that sticks out above its line. */
const COLUMN_MARGIN_TOP = 16;
const HOUR_LABEL_ROOM = 14;
const HOURS = Array.from({ length: DEFAULT_END_HOUR - DEFAULT_START_HOUR }, (_, i) => DEFAULT_START_HOUR + i);

export interface WeekColumn {
  day: string;
  weekday: string;
  dayOfMonth: number;
  /** "Thursday, November 12": what a screen reader says for the whole column. */
  longLabel: string;
  isToday: boolean;
  layout: DayLayout;
}

/**
 * Seven days side by side on one shared time axis. Every column is laid out like the day planner (overlapping
 * tasks share lanes), and an empty slot starts a new task at that day and hour.
 */
@Component({
  selector: 'tf-week-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './week-grid.component.html',
  styleUrl: './week-grid.component.scss',
})
export class WeekGridComponent {
  private readonly injector = inject(Injector);
  private readonly i18n = inject(I18nService);

  /** The seven days, "yyyy-MM-dd", Monday first. */
  readonly days = input.required<readonly string[]>();
  /** One layout per day, in the order of `days`. */
  readonly layouts = input.required<readonly DayLayout[]>();
  readonly today = input.required<string>();
  readonly now = input.required<Date>();
  readonly flashId = input<string | null>(null);
  /** A task to bring into view when the week opens (set after saving one from here). */
  readonly highlight = input<string>();
  /** -1 when the user went to an earlier week, 1 for a later one: blocks slide in from that side. */
  readonly direction = input(1);
  readonly createAt = output<{ day: string; minute: number }>();

  protected readonly hours = HOURS;
  protected readonly gridHeight = (DEFAULT_END_HOUR - DEFAULT_START_HOUR) * 60 * PX_PER_MINUTE;
  protected readonly clock = clock;

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly columns = computed<WeekColumn[]>(() => {
    const locale = this.i18n.locale();
    const short = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const long = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' });
    return this.days().map((day, i) => {
      const date = parseDay(day);
      return {
        day,
        weekday: short.format(date),
        dayOfMonth: date.getDate(),
        longLabel: long.format(date),
        isToday: day === this.today(),
        layout: this.layouts()[i],
      };
    });
  });

  /** The red "now" line, only in today's column. */
  protected readonly nowTop = computed(() => (this.now().getHours() * 60 + this.now().getMinutes()) * PX_PER_MINUTE);

  constructor() {
    // Opens on the part of the week that matters: the current hour when today is in this week, otherwise an hour
    // before the first task. Only a new set of columns re-runs it, so the clock tick never yanks the scroll away.
    effect(() => {
      const columns = this.columns();
      const { pointedAt, target } = untracked(() => ({ pointedAt: this.highlight(), target: this.openingScroll(columns) }));
      afterNextRender(() => {
        const element = this.scroller()?.nativeElement;
        if (!element) {
          return;
        }
        const found = pointedAt ? columns.flatMap((c) => c.layout.blocks).find((b) => b.task.id === pointedAt) : undefined;
        element.scrollTop = found
          ? Math.max(0, COLUMN_MARGIN_TOP + this.top(found) + this.height(found) / 2 - element.clientHeight / 2)
          : target;
      }, { injector: this.injector });
    });
  }

  private openingScroll(columns: readonly WeekColumn[]): number {
    if (columns.some((c) => c.isToday)) {
      return Math.max(0, COLUMN_MARGIN_TOP + this.now().getHours() * 60 * PX_PER_MINUTE - HOUR_LABEL_ROOM);
    }
    const starts = columns.flatMap((c) => c.layout.blocks.map((b) => b.startMinute));
    return starts.length ? Math.max(0, COLUMN_MARGIN_TOP + (Math.min(...starts) - 60) * PX_PER_MINUTE) : 0;
  }

  protected hourTop(hour: number): number {
    return hour * 60 * PX_PER_MINUTE;
  }

  protected top(block: ScheduledBlock): number {
    return block.startMinute * PX_PER_MINUTE;
  }

  protected height(block: ScheduledBlock): number {
    return Math.max((block.endMinute - block.startMinute) * PX_PER_MINUTE, 26);
  }

  protected isShort(block: ScheduledBlock): boolean {
    return this.height(block) < 36;
  }

  protected label(block: ScheduledBlock): string {
    return blockLabel(block, (k, p) => this.i18n.t(k, p));
  }
}
