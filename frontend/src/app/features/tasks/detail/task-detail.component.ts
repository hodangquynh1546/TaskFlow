import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzRadioModule } from 'ng-zorro-antd/radio';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { burstConfetti } from '../../../core/motion/confetti';
import { NotifyService } from '../../../core/notify/notify.service';
import { STATUS_KEYS, TASK_STATUSES, TaskStatus } from '../../../shared/models/task.models';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { DueLabelComponent } from '../../../shared/ui/due-label.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state.component';
import { PriorityMarkerComponent } from '../../../shared/ui/priority-marker.component';
import { TaskMissingComponent } from '../../../shared/ui/task-missing.component';
import { TimeBlockComponent } from '../../../shared/ui/time-block.component';
import { createTaskResource } from '../task-resource';
import { TaskService } from '../task.service';

@Component({
  selector: 'tf-task-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NzButtonModule, NzIconModule, NzRadioModule, DueLabelComponent, ErrorStateComponent, PriorityMarkerComponent, TaskMissingComponent, TimeBlockComponent, TranslatePipe],
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.scss',
})
export class TaskDetailComponent {
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  protected readonly i18n = inject(I18nService);

  readonly id = input.required<string>();

  protected readonly resource = createTaskResource(this.id, this.tasks, inject(DestroyRef));
  protected readonly statuses = TASK_STATUSES;
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly busy = signal(false);

  protected changeStatus(status: TaskStatus): void {
    const current = this.resource.task();
    if (!current || status === current.status || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.tasks.changeStatus(current.id, status).subscribe({
      next: (updated) => {
        this.resource.set(updated);
        this.busy.set(false);
        this.notify.success(this.i18n.t(status === 'Completed' ? 'toast.completed' : status === 'InProgress' ? 'toast.toDoing' : 'toast.toTodo'));
        if (status === 'Completed') {
          burstConfetti();
        }
      },
      error: (error: ApiError) => {
        // The radio already moved; put the model back so what is shown matches what is saved.
        this.resource.set({ ...current });
        this.busy.set(false);
        this.notify.error(error.message);
      },
    });
  }

  protected async remove(): Promise<void> {
    const current = this.resource.task();
    if (!current || this.busy() || !(await this.confirm.confirmDelete(current.title))) {
      return;
    }
    this.busy.set(true);
    this.tasks.delete(current.id).subscribe({
      next: () => {
        this.notify.success(this.i18n.t('toast.deleted'));
        void this.router.navigateByUrl('/tasks');
      },
      error: (error: ApiError) => {
        this.busy.set(false);
        this.notify.error(error.message);
      },
    });
  }
}
