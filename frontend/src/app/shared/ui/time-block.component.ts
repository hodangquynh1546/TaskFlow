import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { Task } from '../models/task.models';
import { describeTimeBlock } from '../util/time-block';

/** When a task is planned and for how long. Renders nothing for a task with no planning at all. */
@Component({
  selector: 'tf-time-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (info(); as i) {
      <span class="block" [attr.title]="i.title">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.7" />
          <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        <span>{{ i.when }}</span>
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
    .block { display: inline-flex; align-items: center; gap: var(--tf-space-1); font-size: var(--tf-text-small); color: var(--tf-ink-soft); line-height: 1.2; font-variant-numeric: tabular-nums; }
    .block__duration { margin-left: var(--tf-space-1); padding: 1px var(--tf-space-2); border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill); background: var(--tf-sky-tint); color: var(--tf-ink); font-weight: 600; font-size: var(--tf-text-caption); }
  `,
})
export class TimeBlockComponent {
  private readonly i18n = inject(I18nService);

  readonly task = input.required<Pick<Task, 'startDate' | 'durationMinutes'>>();

  protected readonly info = computed(() => describeTimeBlock(this.task(), new Date(), (k, p) => this.i18n.t(k, p), this.i18n.locale()));
}
