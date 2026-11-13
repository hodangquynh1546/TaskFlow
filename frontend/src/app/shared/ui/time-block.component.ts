import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { Task, TaskStatus } from '../models/task.models';
import { describeTimeBlock } from '../util/time-block';

/** When a task is planned and for how long. Renders nothing for a task with no planning at all. */
@Component({
  selector: 'tf-time-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as i) {
      <span class="block" [attr.title]="i.title">
        <span class="block__when" [class]="status() ? 'block__when block__when--' + status() : 'block__when'">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7" />
            <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
          <span>{{ i.when }}</span>
        </span>
        @if (i.duration && task().startDate !== null) {
          <span class="block__duration">{{ i.duration }}</span>
        } @else if (i.duration) {
          <span>{{ i.duration }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .block { display: inline-flex; flex-wrap: wrap; align-items: center; gap: var(--tf-space-1) var(--tf-space-2); font-size: var(--tf-text-small); color: var(--tf-ink-soft); line-height: 1.2; font-variant-numeric: tabular-nums; }
    // With a status given, the time slot is a chip in that status's colour, so when a task happens stands out at a glance.
    .block__when { display: inline-flex; align-items: center; gap: var(--tf-space-1); }
    .block__when--Todo, .block__when--InProgress, .block__when--Completed {
      padding: 3px var(--tf-space-3) 3px var(--tf-space-2); border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill);
      color: var(--tf-on-color); font-weight: 800; font-size: var(--tf-text-body, 0.9375rem);
    }
    .block__when--Todo { background: var(--tf-sky); }
    .block__when--InProgress { background: var(--tf-lemon); }
    .block__when--Completed { background: var(--tf-mint); }
    .block__duration { margin-left: var(--tf-space-1); padding: 1px var(--tf-space-2); border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill); background: var(--tf-sky-tint); color: var(--tf-ink); font-weight: 600; font-size: var(--tf-text-caption); }
  `,
})
export class TimeBlockComponent {
  private readonly i18n = inject(I18nService);

  readonly task = input.required<Pick<Task, 'startDate' | 'durationMinutes'>>();
  /** When given, the time slot is coloured like that status (sky, lemon, mint). */
  readonly status = input<TaskStatus | null>(null);

  protected readonly info = computed(() => describeTimeBlock(this.task(), new Date(), (k, p) => this.i18n.t(k, p), this.i18n.locale()));
}
