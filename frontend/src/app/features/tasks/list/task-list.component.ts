import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzPaginationModule } from 'ng-zorro-antd/pagination';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { BehaviorSubject, EMPTY, combineLatest, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/messages/vi';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { burstConfetti } from '../../../core/motion/confetti';
import { NotifyService } from '../../../core/notify/notify.service';
import {
  PRIORITY_KEYS,
  PagedResult,
  STATUS_KEYS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  Task,
  TaskPriority,
  TaskStatus,
} from '../../../shared/models/task.models';
import { DueLabelComponent } from '../../../shared/ui/due-label.component';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { EmptyStateComponent } from '../../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state.component';
import { PriorityMarkerComponent } from '../../../shared/ui/priority-marker.component';
import { TimeBlockComponent } from '../../../shared/ui/time-block.component';
import {
  PAGE_SIZES,
  SORT_FIELDS,
  TaskListQuery,
  TaskSortField,
  clearFilters,
  formatDay,
  hasActiveFilters,
  parseDay,
  parseTaskQuery,
  toQueryParams,
} from '../task-query';
import { TaskService } from '../task.service';

/** Room an open row menu needs below its button: two items, a divider and the shadow. */
const MENU_HEIGHT = 130;

type LoadState = 'loading' | 'ready' | 'error';

const SORT_KEYS: Readonly<Record<TaskSortField, MessageKey>> = {
  createdAt: 'tasks.sort.createdAt',
  dueDate: 'tasks.sort.dueDate',
  startDate: 'tasks.sort.startDate',
  priority: 'tasks.sort.priority',
};

@Component({
  selector: 'tf-task-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, ReactiveFormsModule, RouterLink,
    NzButtonModule, NzCheckboxModule, NzDatePickerModule, NzDropDownModule, NzIconModule, NzInputModule, NzMenuModule, NzPaginationModule, NzSelectModule,
    DueLabelComponent, EmptyStateComponent, ErrorStateComponent, PriorityMarkerComponent, TimeBlockComponent, TranslatePipe,
  ],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tasks = inject(TaskService);
  private readonly notify = inject(NotifyService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly sortFields = SORT_FIELDS;
  protected readonly pageSizes = [...PAGE_SIZES];
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly priorityKeys = PRIORITY_KEYS;
  protected readonly sortKeys = SORT_KEYS;

  /** The URL is the single source of truth for filters, sorting and page. */
  protected readonly query = toSignal(this.route.queryParamMap.pipe(map(parseTaskQuery)), { initialValue: parseTaskQuery(this.route.snapshot.queryParamMap) });
  protected readonly filtersActive = computed(() => hasActiveFilters(this.query()));
  protected readonly activeFilterCount = computed(() => {
    const q = this.query();
    return [q.search.trim(), q.status, q.priority, q.dueFrom || q.dueTo, q.overdue].filter(Boolean).length;
  });
  protected readonly dateRange = computed<Date[]>(() => {
    const q = this.query();
    return q.dueFrom && q.dueTo ? [parseDay(q.dueFrom), parseDay(q.dueTo)] : [];
  });

  protected readonly state = signal<LoadState>('loading');
  protected readonly data = signal<PagedResult<Task> | null>(null);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly filtersOpen = signal(false);
  protected readonly busy = signal<ReadonlySet<string>>(new Set());

  /** Opens upward when a downward menu would run under the bottom tab bar (phones), which it would otherwise cover. */
  protected readonly menuPlacement = signal<'bottomRight' | 'topRight'>('bottomRight');

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  protected readonly rangeText = computed(() => {
    const d = this.data();
    if (!d || d.totalCount === 0) {
      return '';
    }
    const first = (d.page - 1) * d.pageSize + 1;
    return this.i18n.t('tasks.range', { from: first, to: Math.min(first + d.items.length - 1, d.totalCount), total: d.totalCount });
  });

  /** true = refresh in place (after a change the user made) without swapping the list for skeletons. */
  private readonly reload$ = new BehaviorSubject<boolean>(false);

  constructor() {
    effect(() => this.searchControl.setValue(this.query().search, { emitEvent: false }));

    this.searchControl.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((text) => {
        if (text.trim() !== this.query().search.trim()) {
          this.navigate({ search: text }, true);
        }
      });

    combineLatest([toObservable(this.query), this.reload$])
      .pipe(
        tap(([, silent]) => {
          if (!silent) {
            this.state.set('loading');
          }
        }),
        switchMap(([query]) =>
          this.tasks.list(query).pipe(
            catchError((error: ApiError) => {
              this.error.set(error);
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        // The user deleted the last row of the last page, or typed a page number that no longer exists.
        if (result.items.length === 0 && result.totalCount > 0 && result.page > result.totalPages) {
          this.navigate({ page: result.totalPages }, true);
          return;
        }
        this.data.set(result);
        this.error.set(null);
        this.state.set('ready');
      });
  }

  protected navigate(patch: Partial<TaskListQuery>, replaceUrl = false): void {
    const next: TaskListQuery = { ...this.query(), page: 1, ...patch };
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(next), queryParamsHandling: 'merge', replaceUrl });
  }

  protected setSort(field: TaskSortField): void {
    this.navigate({ sortBy: field });
  }

  protected toggleDirection(): void {
    this.navigate({ sortDir: this.query().sortDir === 'asc' ? 'desc' : 'asc' });
  }

  protected setRange(value: Date[] | null): void {
    this.navigate(value && value.length === 2 ? { dueFrom: formatDay(value[0]), dueTo: formatDay(value[1]) } : { dueFrom: null, dueTo: null });
  }

  protected setStatus(status: TaskStatus | null): void {
    this.navigate({ status });
  }

  protected setPriority(priority: TaskPriority | null): void {
    this.navigate({ priority });
  }

  protected clearAllFilters(): void {
    this.navigate(clearFilters(this.query()));
  }

  protected goTo(page: number): void {
    this.navigate({ page });
  }

  protected setPageSize(pageSize: number): void {
    this.navigate({ pageSize });
  }

  protected retry(): void {
    this.reload$.next(false);
  }

  protected createTask(): void {
    void this.router.navigateByUrl('/tasks/new');
  }

  protected placeMenu(event: Event): void {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const bar = document.querySelector('tf-tab-bar');
    const floor = bar && bar.getBoundingClientRect().height > 0 ? bar.getBoundingClientRect().top : window.innerHeight;
    this.menuPlacement.set(button.getBoundingClientRect().bottom + MENU_HEIGHT > floor ? 'topRight' : 'bottomRight');
  }

  protected isBusy(id: string): boolean {
    return this.busy().has(id);
  }

  /** One of the three status buttons; pressing the current status does nothing. */
  protected chooseStatus(task: Task, status: TaskStatus, event?: Event): void {
    if (task.status !== status) {
      this.setTaskStatus(task, status, status === 'Completed' ? this.centerOf(event) : undefined);
    }
  }

  protected setTaskStatus(task: Task, status: TaskStatus, celebrateAt?: { x: number; y: number }): void {
    if (this.isBusy(task.id)) {
      return;
    }
    this.markBusy(task.id, true);
    this.tasks.changeStatus(task.id, status).subscribe({
      next: () => {
        this.markBusy(task.id, false);
        this.notify.success(this.statusToast(status));
        if (status === 'Completed') {
          burstConfetti(celebrateAt);
        }
        this.reload$.next(true);
      },
      error: (error: ApiError) => {
        this.markBusy(task.id, false);
        this.notify.error(error.message);
      },
    });
  }

  protected async remove(task: Task): Promise<void> {
    if (this.isBusy(task.id) || !(await this.confirm.confirmDelete(task.title))) {
      return;
    }
    this.markBusy(task.id, true);
    this.tasks.delete(task.id).subscribe({
      next: () => {
        this.markBusy(task.id, false);
        this.notify.success(this.i18n.t('toast.deleted'));
        this.reload$.next(true);
      },
      error: (error: ApiError) => {
        this.markBusy(task.id, false);
        this.notify.error(error.message);
      },
    });
  }

  protected trackById(_index: number, task: Task): string {
    return task.id;
  }

  private markBusy(id: string, busy: boolean): void {
    this.busy.update((set) => {
      const next = new Set(set);
      if (busy) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  private statusToast(status: TaskStatus): string {
    return this.i18n.t(status === 'Completed' ? 'toast.completed' : status === 'InProgress' ? 'toast.toDoing' : 'toast.toTodo');
  }

  /** Where the confetti should start: the centre of the control that was pressed. */
  private centerOf(event?: Event): { x: number; y: number } | undefined {
    const el = event?.currentTarget;
    if (!(el instanceof HTMLElement)) {
      return undefined;
    }
    const box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
}
