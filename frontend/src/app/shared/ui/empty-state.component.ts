import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { MascotComponent, MascotMood } from './mascot.component';

/** An empty screen is an invitation to act: Tí says what is missing and offers the next step. */
@Component({
  selector: 'tf-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzButtonModule, MascotComponent],
  template: `
    <div class="empty">
      <tf-mascot [mood]="mood()" [size]="112" [animated]="true" />
      <div class="empty__body">
        <p class="empty__title">{{ title() }}</p>
        @if (description()) {
          <p class="empty__description">{{ description() }}</p>
        }
        @if (actionLabel()) {
          <button nz-button nzType="primary" nzSize="large" type="button" (click)="action.emit()">{{ actionLabel() }}</button>
        }
      </div>
    </div>
  `,
  styles: `
    .empty { display: flex; align-items: center; gap: var(--tf-space-6); padding: var(--tf-space-8) var(--tf-space-6); max-width: 38rem; }
    .empty__body { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tf-space-2); }
    .empty__title { font-family: var(--tf-font-display); font-size: var(--tf-text-h2); font-weight: 800; line-height: 1.15; }
    .empty__description { color: var(--tf-ink-soft); margin-bottom: var(--tf-space-3); }
    @media (max-width: 479.98px) { .empty { flex-direction: column; text-align: center; } .empty__body { align-items: center; } }
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string>();
  readonly actionLabel = input<string>();
  readonly mood = input<MascotMood>('sleepy');
  readonly action = output<void>();
}
