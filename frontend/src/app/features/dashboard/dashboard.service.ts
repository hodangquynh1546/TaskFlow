import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/config/api.config';
import { DashboardSummary, Task } from '../../shared/models/task.models';

export type ReportPeriod = 'week' | 'month' | 'year';

/** One day (week and month reports) or one month (year report), starting on `start` ("yyyy-MM-dd"). */
export interface ReportBucket {
  start: string;
  completedTasks: number;
  minutes: number;
}

export interface ReportTotals {
  completedTasks: number;
  minutes: number;
  /** Days of the period that have already happened; 0 for a period still in the future. */
  elapsedDays: number;
  averagePerDayMinutes: number;
  /** Null in a week report, where it would only repeat the total. */
  averagePerWeekMinutes: number | null;
  /** Only present in a year report. */
  averagePerMonthMinutes: number | null;
}

export interface Report {
  period: ReportPeriod;
  from: string;
  to: string;
  buckets: ReportBucket[];
  totals: ReportTotals;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/dashboard`;

  summary(): Observable<DashboardSummary> {
    return this.http.get<DashboardSummary>(`${this.url}/summary`);
  }

  upcoming(limit = 5, days = 7): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.url}/upcoming-tasks`, { params: new HttpParams().set('limit', limit).set('days', days) });
  }

  /** `date` is any day inside the wanted period; the UTC offset makes the server count days the way the user's clock does. */
  report(period: ReportPeriod, date: string, utcOffsetMinutes: number): Observable<Report> {
    const params = new HttpParams().set('period', period).set('date', date).set('utcOffsetMinutes', utcOffsetMinutes);
    return this.http.get<Report>(`${this.url}/report`, { params });
  }

  recent(limit = 5): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.url}/recent-tasks`, { params: new HttpParams().set('limit', limit) });
  }
}
