import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { STATUS_KEYS, TaskStatus } from '../models/task.models';

/** A coloured sticker chip. Status is never colour alone: each state has its own shape and a text label. */
@Component({
  selector: 'tf-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="status" [class]="'status--' + status()" [class.status--compact]="compact()">
      <svg class="status__icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        @switch (status()) {
          @case ('Todo') {
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2" />
          }
          @case ('InProgress') {
            <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M8 3.6a4.4 4.4 0 0 1 0 8.8z" fill="currentColor" />
          }
          @case ('Completed') {
            <path class="check" d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          }
        }
      </svg>
      <span [class.tf-visually-hidden]="compact()">{{ label() }}</span>
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .status {
      display: inline-flex; align-items: center; gap: var(--tf-space-1); padding: 3px 10px 3px 7px; border: 2px solid var(--tf-edge);
      border-radius: var(--tf-radius-pill); color: var(--tf-on-color); font-size: var(--tf-text-caption); font-weight: 700; line-height: 1.1; white-space: nowrap;
    }
    .status--compact { padding: 3px; }
    .status--Todo { background: var(--tf-sky); }
    .status--InProgress { background: var(--tf-lemon); }
    .status--Completed { background: var(--tf-mint); }
    .status__icon { flex: none; }
    // Completing a task draws the tick instead of swapping it in.
    .check { stroke-dasharray: 20; animation: draw 380ms var(--tf-ease-out) both; }
    @keyframes draw { from { stroke-dashoffset: 20; } to { stroke-dashoffset: 0; } }
  `,
})
export class StatusIndicatorComponent {
  private readonly i18n = inject(I18nService);

  readonly status = input.required<TaskStatus>();
  /** Icon only; the label stays available to screen readers. */
  readonly compact = input(false);

  protected readonly label = computed(() => this.i18n.t(STATUS_KEYS[this.status()]));
}
