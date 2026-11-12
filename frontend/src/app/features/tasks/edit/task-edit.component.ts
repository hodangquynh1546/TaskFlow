import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { NotifyService } from '../../../core/notify/notify.service';
import { TaskPayload } from '../../../shared/models/task.models';
import { ErrorStateComponent } from '../../../shared/ui/error-state.component';
import { TaskMissingComponent } from '../../../shared/ui/task-missing.component';
import { TaskFormComponent } from '../form/task-form.component';
import { createTaskResource } from '../task-resource';
import { TaskService } from '../task.service';

@Component({
  selector: 'tf-task-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NzButtonModule, NzIconModule, ErrorStateComponent, TaskFormComponent, TaskMissingComponent, TranslatePipe],
  template: `
    @switch (resource.state()) {
      @case ('notFound') { <tf-task-missing /> }
      @case ('error') {
        <tf-error-state [message]="resource.error()?.message ?? ('detail.loadError' | t)" (retry)="resource.reload()" />
      }
      @default {
        <a class="tf-back" [routerLink]="['/tasks', id()]"><span nz-icon nzType="arrow-left" nzTheme="outline" aria-hidden="true"></span>{{ 'detail.backToTask' | t }}</a>
        <header class="tf-page-header"><h1>{{ 'title.taskEdit' | t }}</h1></header>
        @if (resource.state() === 'loading') {
          <div class="skeleton tf-skeleton" role="status" aria-busy="true"><span class="tf-visually-hidden">{{ 'detail.loading' | t }}</span></div>
        } @else {
          <tf-task-form [submitLabel]="'common.save' | t" [task]="resource.task()" [saving]="saving()" (save)="save($event)" (cancelled)="cancel()" />
        }
      }
    }
  `,
  styles: `
    .skeleton { max-width: 42rem; height: 26rem; border-radius: var(--tf-radius-panel); }
  `,
})
export class TaskEditComponent {
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly i18n = inject(I18nService);

  /** Bound from the route parameter by the router. */
  readonly id = input.required<string>();

  protected readonly resource = createTaskResource(this.id, this.tasks, inject(DestroyRef));
  private readonly form = viewChild(TaskFormComponent);
  protected readonly saving = signal(false);

  protected save(payload: TaskPayload): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.tasks.update(this.id(), payload).subscribe({
      next: () => {
        this.notify.success(this.i18n.t('toast.saved'));
        void this.router.navigate(['/tasks', this.id()]);
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        if (error.status === 404) {
          this.notify.error(this.i18n.t('toast.gone'));
          void this.router.navigateByUrl('/tasks');
          return;
        }
        this.form()?.showServerError(error);
      },
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/tasks', this.id()]);
  }
}
