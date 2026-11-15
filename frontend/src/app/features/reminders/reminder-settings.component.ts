import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { desktopBridge } from '../../core/desktop';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NotifyPermission, SystemNotifier } from '../../core/notify/system-notifier';

/** Says what is announced and whether notifications are allowed; offers the one button a browser needs. */
@Component({
  selector: 'tf-reminder-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzButtonModule, TranslatePipe],
  template: `
    <h2 id="reminder-title" class="title">{{ 'reminder.title' | t }}</h2>
    <p class="hint">{{ 'reminder.rules' | t }}</p>

    @switch (permission()) {
      @case ('granted') { <p class="state state--on" role="status">{{ 'reminder.on' | t }}</p> }
      @case ('denied') { <p class="state" role="status">{{ 'reminder.denied' | t }}</p> }
      @case ('unsupported') { <p class="state" role="status">{{ 'reminder.unsupported' | t }}</p> }
      @default {
        <button type="button" nz-button nzType="primary" (click)="enable()">{{ 'reminder.enable' | t }}</button>
      }
    }

    @if (inDesktopApp) {
      <p class="hint">{{ 'reminder.desktopHint' | t }}</p>
    }
  `,
  styles: `
    :host { display: block; }
    .title { font-size: var(--tf-text-h3); margin-bottom: var(--tf-space-3); }
    .hint { color: var(--tf-ink-soft); font-size: var(--tf-text-small); margin: 0 0 var(--tf-space-3); }
    .state { font-weight: 600; margin: 0 0 var(--tf-space-3); }
    .state--on { color: var(--tf-ink); }
  `,
})
export class ReminderSettingsComponent {
  private readonly notifier = inject(SystemNotifier);

  protected readonly permission = signal<NotifyPermission>(this.notifier.permission());
  protected readonly inDesktopApp = desktopBridge() !== null;

  protected async enable(): Promise<void> {
    this.permission.set(await this.notifier.request());
  }
}
