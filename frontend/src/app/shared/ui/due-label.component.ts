import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { TaskStatus } from '../models/task.models';
import { describeDue } from '../util/due';

@Component({
  selector: 'tf-due',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="due" [class]="'due--' + info().kind" [attr.title]="info().title">
      @if (info().kind === 'overdue') {
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M8 1.5l7 12.5H1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
          <path d="M8 6.2v3.6M8 11.6v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      } @else if (info().kind === 'soon') {
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8" />
          <path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      }
      <span>{{ info().text }}</span>
    </span>
  `,
  styles: `
    :host { display: inline-flex; }
    .due { display: inline-flex; align-items: center; gap: var(--tf-space-1); font-size: var(--tf-text-small); color: var(--tf-ink-soft); line-height: 1.2; }
    .due--overdue, .due--soon { padding: 2px 10px 2px 8px; border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill); color: var(--tf-ink); font-weight: 700; font-size: var(--tf-text-caption); }
    .due--overdue { background: var(--tf-bubblegum); color: var(--tf-on-color); }
    .due--soon { background: var(--tf-lemon-tint); }
  `,
})
export class DueLabelComponent {
  private readonly i18n = inject(I18nService);

  readonly dueDate = input.required<string | null>();
  readonly status = input.required<TaskStatus>();

  protected readonly info = computed(() => describeDue(this.dueDate(), this.status(), new Date(), (k, p) => this.i18n.t(k, p), this.i18n.locale()));
}
