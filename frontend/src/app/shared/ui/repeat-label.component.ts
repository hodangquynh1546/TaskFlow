import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { MessageKey } from '../../core/i18n/messages/vi';
import { Recurrence, RecurrenceFrequency } from '../models/task.models';

const OPTION_KEYS: Readonly<Record<RecurrenceFrequency, MessageKey>> = {
  Daily: 'repeat.option.Daily',
  Weekly: 'repeat.option.Weekly',
  Monthly: 'repeat.option.Monthly',
  Yearly: 'repeat.option.Yearly',
};
const UNIT_KEYS: Readonly<Record<RecurrenceFrequency, MessageKey>> = {
  Daily: 'repeat.unit.Daily',
  Weekly: 'repeat.unit.Weekly',
  Monthly: 'repeat.unit.Monthly',
  Yearly: 'repeat.unit.Yearly',
};

/** "Hằng tuần" or "Mỗi 2 tuần", with a loop icon, for a task that repeats. Renders nothing for one that does not. */
@Component({
  selector: 'tf-repeat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (text(); as label) {
      <span class="repeat" [attr.title]="title()">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
          <path d="M3 7a5 5 0 0 1 8.6-3.2L13 5.2M13 9a5 5 0 0 1-8.6 3.2L3 10.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          <path d="M13 2.2v3h-3M3 13.8v-3h3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>{{ label }}</span>
      </span>
    }
  `,
  styles: `
    :host { display: inline-flex; }
    .repeat { display: inline-flex; align-items: center; gap: var(--tf-space-1); font-size: var(--tf-text-caption); font-weight: 700; color: var(--tf-ink-soft); line-height: 1.2; }
  `,
})
export class RepeatLabelComponent {
  private readonly i18n = inject(I18nService);

  readonly recurrence = input<Recurrence | null | undefined>(null);

  protected readonly text = computed(() => {
    const rule = this.recurrence();
    if (!rule) {
      return '';
    }
    return rule.interval === 1
      ? this.i18n.t(OPTION_KEYS[rule.frequency])
      : `${this.i18n.t('repeat.every')} ${rule.interval} ${this.i18n.t(UNIT_KEYS[rule.frequency])}`;
  });

  protected readonly title = computed(() => (this.recurrence() ? this.i18n.t('repeat.title') : null));
}
