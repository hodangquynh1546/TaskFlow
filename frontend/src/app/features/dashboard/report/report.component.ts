import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { BehaviorSubject, EMPTY, combineLatest, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { MessageKey } from '../../../core/i18n/messages/vi';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { BarChartComponent } from '../../../shared/ui/bar-chart.component';
import { ErrorStateComponent } from '../../../shared/ui/error-state.component';
import { formatDuration } from '../../../shared/util/duration';
import { parseDay } from '../../tasks/task-query';
import { DashboardService, Report, ReportPeriod } from '../dashboard.service';
import { niceCeil, periodAnchor } from './report-math';

const PERIODS: readonly ReportPeriod[] = ['week', 'month', 'year'];
const PERIOD_KEYS: Readonly<Record<ReportPeriod, MessageKey>> = { week: 'report.period.week', month: 'report.period.month', year: 'report.period.year' };

/** Weekly, monthly and yearly view of the time worked and the tasks finished, with averages. */
@Component({
  selector: 'tf-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzButtonModule, NzIconModule, BarChartComponent, ErrorStateComponent, TranslatePipe],
  templateUrl: './report.component.html',
  styleUrl: './report.component.scss',
})
export class ReportComponent {
  private readonly dashboard = inject(DashboardService);
  protected readonly i18n = inject(I18nService);

  protected readonly periods = PERIODS;
  protected readonly periodKeys = PERIOD_KEYS;
  protected readonly period = signal<ReportPeriod>('week');
  /** How many periods before the current one is shown; 0 is the current one and there is no going past it. */
  protected readonly back = signal(0);

  protected readonly data = signal<Report | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  private readonly reload$ = new BehaviorSubject<void>(undefined);

  private readonly t = (key: Parameters<I18nService['t']>[0], params?: Parameters<I18nService['t']>[1]): string => this.i18n.t(key, params);

  protected readonly rangeText = computed(() => {
    const report = this.data();
    if (!report) {
      return '';
    }
    const from = parseDay(report.from);
    const to = parseDay(report.to);
    switch (report.period) {
      case 'week':
        return `${this.i18n.formatDate(from, { day: 'numeric', month: 'short' })} – ${this.i18n.formatDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      case 'month':
        return this.i18n.formatDate(from, { month: 'long', year: 'numeric' });
      default:
        return this.i18n.formatDate(from, { year: 'numeric' });
    }
  });

  protected readonly hasWork = computed(() => (this.data()?.totals.completedTasks ?? 0) > 0);

  protected readonly rows = computed(() => {
    const report = this.data();
    if (!report) {
      return [];
    }
    return report.buckets.map((bucket) => {
      const day = parseDay(bucket.start);
      const byMonth = report.period === 'year';
      const showLabel = report.period !== 'month' || day.getDate() === 1 || day.getDate() % 5 === 0;
      return {
        label: showLabel
          ? byMonth
            ? this.i18n.formatDate(day, { month: 'short' })
            : report.period === 'week'
              ? this.i18n.formatDate(day, { weekday: 'short' })
              : String(day.getDate())
          : '',
        full: byMonth ? this.i18n.formatDate(day, { month: 'long', year: 'numeric' }) : this.i18n.formatDate(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
        minutes: bucket.minutes,
        tasks: bucket.completedTasks,
      };
    });
  });

  protected readonly hoursChart = computed(() => {
    const rows = this.rows();
    const max = niceCeil(Math.max(0, ...rows.map((r) => r.minutes)) / 60);
    const hours = (n: number) => this.t('report.hoursShort', { n: this.i18n.formatNumber(n, { maximumFractionDigits: 1 }) });
    return {
      values: rows.map((r) => r.minutes / 60),
      labels: rows.map((r) => r.label),
      titles: rows.map((r) => this.t('report.barLabel', { label: r.full, value: this.duration(r.minutes) })),
      max,
      ticks: [hours(max), hours(max / 2), hours(0)] as [string, string, string],
    };
  });

  protected readonly tasksChart = computed(() => {
    const rows = this.rows();
    const max = niceCeil(Math.max(0, ...rows.map((r) => r.tasks)), 2);
    const count = (n: number) => this.i18n.formatNumber(n);
    return {
      values: rows.map((r) => r.tasks),
      labels: rows.map((r) => r.label),
      titles: rows.map((r) => this.t('report.barLabel', { label: r.full, value: count(r.tasks) })),
      max,
      ticks: [count(max), count(max / 2), count(0)] as [string, string, string],
    };
  });

  protected readonly tiles = computed(() => {
    const totals = this.data()?.totals;
    if (!totals) {
      return [];
    }
    // Before a period has started there is nothing to average, so say so with a dash instead of "0 min".
    const average = (minutes: number | null) => (minutes === null || totals.elapsedDays === 0 ? '—' : this.duration(minutes));
    const tiles: { key: MessageKey; value: string }[] = [
      { key: 'report.stat.total' as const, value: this.duration(totals.minutes) },
      { key: 'report.stat.perDay' as const, value: average(totals.averagePerDayMinutes) },
    ];
    if (totals.averagePerWeekMinutes !== null) {
      tiles.push({ key: 'report.stat.perWeek' as const, value: average(totals.averagePerWeekMinutes) });
    }
    if (totals.averagePerMonthMinutes !== null) {
      tiles.push({ key: 'report.stat.perMonth' as const, value: average(totals.averagePerMonthMinutes) });
    }
    tiles.push({ key: 'report.stat.completed' as const, value: this.i18n.formatNumber(totals.completedTasks) });
    return tiles;
  });

  constructor() {
    combineLatest([toObservable(this.period), toObservable(this.back), this.reload$])
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(([period, back]) =>
          this.dashboard.report(period, periodAnchor(new Date(), period, back), -new Date().getTimezoneOffset()).pipe(
            catchError((error: ApiError) => {
              this.error.set(error);
              this.loading.set(false);
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((report) => {
        this.data.set(report);
        this.loading.set(false);
      });
  }

  protected choose(period: ReportPeriod): void {
    if (period !== this.period()) {
      this.back.set(0);
      this.period.set(period);
    }
  }

  protected step(direction: -1 | 1): void {
    this.back.update((n) => Math.max(0, n - direction));
  }

  protected retry(): void {
    this.reload$.next();
  }

  protected duration(minutes: number): string {
    return formatDuration(minutes, (k, p) => this.i18n.t(k, p));
  }
}
