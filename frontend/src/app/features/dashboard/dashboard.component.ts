import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { BehaviorSubject, EMPTY, forkJoin, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AuthService } from '../../core/auth/auth.service';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Translate, viTranslate } from '../../core/i18n/translate';
import { ApiError } from '../../core/http/api-error';
import { DashboardSummary, Task } from '../../shared/models/task.models';
import { DueLabelComponent } from '../../shared/ui/due-label.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { CountComponent } from '../../shared/ui/count.component';
import { MascotComponent, MascotMood } from '../../shared/ui/mascot.component';
import { ProgressStripComponent } from '../../shared/ui/progress-strip.component';
import { StatusIndicatorComponent } from '../../shared/ui/status-indicator.component';
import { givenName } from '../../shared/util/names';
import { relativeTime } from '../../shared/util/relative-time';
import { DashboardService } from './dashboard.service';
import { ReportComponent } from './report/report.component';

interface DashboardData {
  summary: DashboardSummary;
  upcoming: Task[];
  recent: Task[];
}

/** One sentence that states the situation using real numbers only. Empty for a new user: the empty state says it already. */
export function describeSituation(summary: DashboardSummary, t: Translate = viTranslate): string {
  if (summary.total === 0) {
    return '';
  }
  const open = summary.todo + summary.inProgress;
  if (open === 0) {
    return t('dashboard.sit.allDone');
  }
  return summary.overdue > 0 ? t('dashboard.sit.openOverdue', { open, overdue: summary.overdue }) : t('dashboard.sit.open', { open });
}

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/** Which greeting fits the hour: before noon, before 18:00, otherwise evening (night included). */
export function dayPeriod(date: Date): DayPeriod {
  const hour = date.getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

/** Tí's face follows the numbers: worried when something is overdue, cheering when nothing is left. */
export function moodFor(summary: DashboardSummary): MascotMood {
  if (summary.overdue > 0) {
    return 'worried';
  }
  return summary.todo + summary.inProgress === 0 ? 'cheer' : 'wave';
}

@Component({
  selector: 'tf-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DueLabelComponent, EmptyStateComponent, ErrorStateComponent, ProgressStripComponent, StatusIndicatorComponent, CountComponent, MascotComponent, ReportComponent, TranslatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly data = signal<DashboardData | null>(null);
  protected readonly error = signal<ApiError | null>(null);

  protected readonly name = computed(() => givenName(this.auth.user()?.fullName));
  protected readonly situation = computed(() => (this.data() ? describeSituation(this.data()!.summary, (k, p) => this.i18n.t(k, p)) : ''));
  protected readonly greeting = computed(() => {
    const period = dayPeriod(new Date());
    return this.name()
      ? this.i18n.t(`dashboard.hello.${period}`, { name: this.name() })
      : this.i18n.t(`dashboard.helloAnon.${period}`);
  });
  protected readonly mood = computed<MascotMood>(() => (this.data() ? moodFor(this.data()!.summary) : 'happy'));

  private readonly reload$ = new BehaviorSubject<void>(undefined);

  constructor() {
    this.reload$
      .pipe(
        tap(() => this.state.set('loading')),
        switchMap(() =>
          forkJoin({ summary: this.dashboard.summary(), upcoming: this.dashboard.upcoming(), recent: this.dashboard.recent() }).pipe(
            catchError((error: ApiError) => {
              this.error.set(error);
              this.state.set('error');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.data.set(result);
        this.error.set(null);
        this.state.set('ready');
      });
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected createTask(): void {
    void this.router.navigateByUrl('/tasks/new');
  }

  protected updated(task: Task): string {
    return relativeTime(task.updatedAt, new Date(), (k, p) => this.i18n.t(k, p), this.i18n.locale());
  }
}
