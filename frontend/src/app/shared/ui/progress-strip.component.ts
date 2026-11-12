import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { DashboardSummary, TaskStatus } from '../models/task.models';
import { CountComponent } from './count.component';
import { StatusIndicatorComponent } from './status-indicator.component';

interface Segment {
  status: TaskStatus;
  count: number;
}

/**
 * One chunky bar split by status. Segment widths are proportional; the legend repeats every count as text, so the bar
 * is never the only carrier of the numbers.
 */
@Component({
  selector: 'tf-progress-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StatusIndicatorComponent, CountComponent],
  template: `
    <figure class="strip">
      <div class="track" role="img" [attr.aria-label]="description()">
        @for (segment of segments(); track segment.status) {
          <span class="segment" [class]="'segment--' + segment.status" [style.flex-grow]="segment.count"></span>
        }
      </div>
      <figcaption>
        <ul class="legend">
          @for (segment of legend(); track segment.status) {
            <li>
              <tf-status [status]="segment.status" />
              <tf-count class="count" [value]="segment.count" />
            </li>
          }
        </ul>
      </figcaption>
    </figure>
  `,
  styles: `
    :host { display: block; }
    .strip { margin: 0; }
    .track { display: flex; height: 26px; border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill); background: var(--tf-paper); overflow: hidden;
             transform-origin: left center; animation: fill 800ms var(--tf-ease-out) 200ms both; }
    .segment { min-width: 8px; }
    .segment + .segment { border-left: 2px solid var(--tf-edge); }
    .segment--Completed { background: var(--tf-mint); }
    .segment--InProgress { background: var(--tf-lemon); }
    .segment--Todo { background: var(--tf-sky); }
    .legend { list-style: none; margin: var(--tf-space-3) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--tf-space-2) var(--tf-space-4); }
    .legend li { display: inline-flex; align-items: center; gap: var(--tf-space-2); }
    .count { font-weight: 800; font-family: var(--tf-font-display); font-size: var(--tf-text-h3); }
    @keyframes fill { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  `,
})
export class ProgressStripComponent {
  private readonly i18n = inject(I18nService);

  readonly summary = input.required<DashboardSummary>();

  private readonly all = computed<Segment[]>(() => {
    const s = this.summary();
    return [
      { status: 'Completed', count: s.completed },
      { status: 'InProgress', count: s.inProgress },
      { status: 'Todo', count: s.todo },
    ];
  });

  /** Only non-empty statuses get a bar segment, so zero counts never leave a sliver. */
  protected readonly segments = computed(() => this.all().filter((s) => s.count > 0));
  protected readonly legend = this.all;

  protected readonly description = computed(() => {
    const s = this.summary();
    if (s.total === 0) {
      return this.i18n.t('dashboard.progress.none');
    }
    return this.i18n.t('dashboard.progress.summary', { done: s.completed, total: s.total, todo: s.todo, doing: s.inProgress, completed: s.completed });
  });
}
