import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/config/api.config';
import { DashboardSummary, Task } from '../../shared/models/task.models';

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

  recent(limit = 5): Observable<Task[]> {
    return this.http.get<Task[]>(`${this.url}/recent-tasks`, { params: new HttpParams().set('limit', limit) });
  }
}
