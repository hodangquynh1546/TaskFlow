import { ChangeDetectionStrategy, Component, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { BrowseMemory } from '../../../core/navigation/browse-memory';
import { NotifyService } from '../../../core/notify/notify.service';
import { TaskPayload } from '../../../shared/models/task.models';
import { TaskFormComponent } from '../form/task-form.component';
import { TaskService } from '../task.service';
import { pageBeforeCreate, whereAfterSave } from './previous-page';

@Component({
  selector: 'tf-task-create',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NzIconModule, TaskFormComponent, TranslatePipe],
  template: `
    <div class="tf-form-page">
      <div class="tf-form-page__head">
        <a class="tf-back" routerLink="/tasks"><span nz-icon nzType="arrow-left" nzTheme="outline" aria-hidden="true"></span>{{ 'tasks.title' | t }}</a>
        <header class="tf-page-header"><h1>{{ 'common.create' | t }}</h1></header>
      </div>
      <div class="tf-form-page__body">
        <tf-task-form [submitLabel]="'common.create' | t" [prefill]="prefill()" [saving]="saving()" [suggest]="suggestTitles" (save)="save($event)" (cancelled)="cancel()" />
      </div>
    </div>
  `,
})
export class TaskCreateComponent {
  private readonly tasks = inject(TaskService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotifyService);
  private readonly i18n = inject(I18nService);
  private readonly memory = inject(BrowseMemory);

  /** Captured while the router is still navigating here, because afterwards it no longer remembers where we came from. */
  private readonly previousUrl = this.router.currentNavigation()?.previousNavigation?.finalUrl?.toString();
  private readonly returnTo = pageBeforeCreate(this.previousUrl);

  /** Bound from the query string by the router: set when the user starts from a free slot on the day calendar. */
  readonly date = input<string>();
  readonly time = input<string>();

  protected readonly prefill = computed(() => ({ date: this.date(), time: this.time() }));
  private readonly form = viewChild.required(TaskFormComponent);
  protected readonly saving = signal(false);
  protected readonly suggestTitles = (prefix: string) => this.tasks.suggestTitles(prefix);

  protected save(payload: TaskPayload): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.tasks.create(payload).subscribe({
      next: (task) => {
        this.notify.success(this.i18n.t('toast.created'));
        // Replaces the form in the history, so Back does not land on an empty form for a task that already exists.
        void this.router.navigateByUrl(whereAfterSave(this.previousUrl, this.memory.last(), task), { replaceUrl: true });
      },
      error: (error: ApiError) => {
        this.saving.set(false);
        this.form().showServerError(error);
      },
    });
  }

  protected cancel(): void {
    void this.router.navigateByUrl(this.returnTo, { replaceUrl: true });
  }
}
