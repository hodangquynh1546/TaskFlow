import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { I18nService } from '../../core/i18n/i18n.service';

/** Says what went wrong and what to do; never apologises or stays vague. */
@Component({
  selector: 'tf-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzButtonModule],
  template: `
    <div class="error" role="alert">
      <p class="error__message">{{ message() }}</p>
      @if (retryLabel() !== '') {
        <button nz-button type="button" (click)="retry.emit()">{{ retryLabel() ?? i18n.t('common.retry') }}</button>
      }
    </div>
  `,
  styles: `
    .error { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tf-space-3); padding: var(--tf-space-4) var(--tf-space-6); max-width: 38rem;
             border: 2px solid var(--tf-edge); background: var(--tf-bubblegum-tint); border-radius: var(--tf-radius-sticker); box-shadow: var(--tf-shadow-small); }
    .error__message { color: var(--tf-ink); font-weight: 500; }
  `,
})
export class ErrorStateComponent {
  protected readonly i18n = inject(I18nService);

  readonly message = input.required<string>();
  /** Defaults to the translated "Try again". Set to an empty string to hide the button. */
  readonly retryLabel = input<string>();
  readonly retry = output<void>();
}
