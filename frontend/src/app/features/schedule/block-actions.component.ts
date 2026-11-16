import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TaskStatus } from '../../shared/models/task.models';

/**
 * Three round buttons on a calendar block, like the window controls of the Mac: yellow starts the task, green
 * finishes it, red deletes it. They sit next to the block's link, not inside it (a link may not contain buttons),
 * and are only shown while the block is hovered or one of them has the keyboard focus. Each has an icon as well as a
 * colour, so none relies on colour alone.
 */
@Component({
  selector: 'tf-block-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button type="button" class="act act--doing" [disabled]="busy()" [attr.aria-pressed]="status() === 'InProgress'"
            [attr.aria-label]="'schedule.markDoing' | t" [attr.title]="'schedule.markDoing' | t" (click)="choose.emit({ status: 'InProgress', event: $event })">
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1.8 8 5 3 8.2z" fill="currentColor" /></svg>
    </button>
    <button type="button" class="act act--done" [disabled]="busy()" [attr.aria-pressed]="status() === 'Completed'"
            [attr.aria-label]="'schedule.markDone' | t" [attr.title]="'schedule.markDone' | t" (click)="choose.emit({ status: 'Completed', event: $event })">
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.3 4.2 7.5 8.2 2.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>
    <button type="button" class="act act--delete" [disabled]="busy()"
            [attr.aria-label]="'schedule.deleteTask' | t" [attr.title]="'schedule.deleteTask' | t" (click)="remove.emit()">
      <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5 7.5 7.5M7.5 2.5 2.5 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
    </button>
  `,
  styleUrl: './block-actions.component.scss',
})
export class BlockActionsComponent {
  readonly status = input.required<TaskStatus>();
  readonly busy = input(false);
  readonly choose = output<{ status: TaskStatus; event: Event }>();
  readonly remove = output<void>();
}
