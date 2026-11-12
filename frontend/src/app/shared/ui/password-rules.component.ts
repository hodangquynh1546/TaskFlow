import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { checkPassword } from '../util/password-rules';

/** Shows which password requirements are still missing while the user types. */
@Component({
  selector: 'tf-password-rules',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <ul class="rules" [attr.aria-label]="'password.rules' | t">
      @for (rule of rules(); track rule.id) {
        <li [class.met]="rule.met">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            @if (rule.met) {
              <circle cx="8" cy="8" r="7" fill="var(--tf-mint)" stroke="currentColor" stroke-width="1.6" />
              <path class="tick" d="M4.6 8.2l2.3 2.3 4.5-4.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            } @else {
              <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6" />
            }
          </svg>
          <span>{{ rule.label }}</span>
          <span class="tf-visually-hidden">{{ (rule.met ? 'password.met' : 'password.unmet') | t }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host { display: block; padding-bottom: var(--tf-space-4); }
    .rules { list-style: none; margin: var(--tf-space-2) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--tf-space-1) var(--tf-space-4); }
    li { display: inline-flex; align-items: center; gap: var(--tf-space-1); font-size: var(--tf-text-caption); color: var(--tf-ink-soft); }
    li.met { color: var(--tf-ink); font-weight: 600; }
    .tick { stroke-dasharray: 14; animation: tick 320ms var(--tf-ease-out) both; }
    @keyframes tick { from { stroke-dashoffset: 14; } to { stroke-dashoffset: 0; } }
  `,
})
export class PasswordRulesComponent {
  private readonly i18n = inject(I18nService);

  readonly password = input<string>('');

  protected readonly rules = computed(() => checkPassword(this.password() ?? '', (k, p) => this.i18n.t(k, p)));
}
