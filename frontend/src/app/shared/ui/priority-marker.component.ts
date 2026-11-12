import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { PRIORITY_KEYS, PRIORITY_LEVEL, TaskPriority } from '../models/task.models';

/** One, two or three rising bars. High is tinted bubblegum so urgency stands out; the others stay neutral. */
@Component({
  selector: 'tf-priority',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="priority" [class.priority--high]="priority() === 'High'" [attr.title]="aria()">
      <svg viewBox="0 0 14 14" width="16" height="16" aria-hidden="true" focusable="false">
        @for (bar of bars; track bar) {
          <rect [attr.x]="bar * 5" [attr.y]="14 - (bar + 1) * 4" width="3.4" [attr.height]="(bar + 1) * 4" rx="1" [class.bar--on]="bar < level()" class="bar" />
        }
      </svg>
      <span [class.tf-visually-hidden]="!showLabel()">{{ showLabel() ? label() : aria() }}</span>
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .priority { display: inline-flex; align-items: center; gap: var(--tf-space-2); font-size: var(--tf-text-small); color: var(--tf-ink-soft); font-weight: 500; line-height: 1; }
    .priority--high { color: var(--tf-ink); font-weight: 700; }
    .bar { fill: var(--tf-line); }
    .bar--on { fill: var(--tf-ink); }
    .priority--high .bar--on { fill: var(--tf-bubblegum); stroke: var(--tf-ink); stroke-width: 1; }
  `,
})
export class PriorityMarkerComponent {
  private readonly i18n = inject(I18nService);

  readonly priority = input.required<TaskPriority>();
  readonly showLabel = input(false);

  protected readonly bars = [0, 1, 2];
  protected readonly level = computed(() => PRIORITY_LEVEL[this.priority()]);
  protected readonly label = computed(() => this.i18n.t(PRIORITY_KEYS[this.priority()]));
  protected readonly aria = computed(() => this.i18n.t('priority.aria', { level: this.label().toLowerCase() }));
}
