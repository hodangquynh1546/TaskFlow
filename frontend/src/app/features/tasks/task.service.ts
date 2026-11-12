import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_URL } from '../../core/config/api.config';
import { PagedResult, Task, TaskPayload, TaskStatus } from '../../shared/models/task.models';
import { TaskListQuery } from './task-query';

/** "2026-11-12" as the first or last instant of that day in the user's own time zone. */
export function dayBoundary(day: string, edge: 'start' | 'end'): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = edge === 'start' ? new Date(y, m - 1, d, 0, 0, 0, 0) : new Date(y, m - 1, d, 23, 59, 59, 999);
  return date.toISOString();
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);
  private readonly url = `${inject(API_BASE_URL)}/tasks`;

  list(query: TaskListQuery): Observable<PagedResult<Task>> {
    let params = new HttpParams()
      .set('sortBy', query.sortBy)
      .set('sortDir', query.sortDir)
      .set('page', query.page)
      .set('pageSize', query.pageSize);

    const search = query.search.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (query.status) {
      params = params.set('status', query.status);
    }
    if (query.priority) {
      params = params.set('priority', query.priority);
    }
    if (query.dueFrom) {
      params = params.set('dueFrom', dayBoundary(query.dueFrom, 'start'));
    }
    if (query.dueTo) {
      params = params.set('dueTo', dayBoundary(query.dueTo, 'end'));
    }
    if (query.overdue) {
      params = params.set('overdue', true);
    }
    return this.http.get<PagedResult<Task>>(this.url, { params });
  }

  /** The tasks that start on one local day ("yyyy-MM-dd"), earliest first. At most 50: more than that is not a day anyone plans. */
  forDay(day: string): Observable<PagedResult<Task>> {
    const params = new HttpParams()
      .set('startFrom', dayBoundary(day, 'start'))
      .set('startTo', dayBoundary(day, 'end'))
      .set('sortBy', 'startDate')
      .set('sortDir', 'asc')
      .set('page', 1)
      .set('pageSize', 50);
    return this.http.get<PagedResult<Task>>(this.url, { params });
  }

  /** The tasks whose deadline falls on one local day, used to list what is due but not yet placed on the timeline. */
  dueOn(day: string): Observable<PagedResult<Task>> {
    const params = new HttpParams()
      .set('dueFrom', dayBoundary(day, 'start'))
      .set('dueTo', dayBoundary(day, 'end'))
      .set('sortBy', 'dueDate')
      .set('sortDir', 'asc')
      .set('page', 1)
      .set('pageSize', 50);
    return this.http.get<PagedResult<Task>>(this.url, { params });
  }

  get(id: string): Observable<Task> {
    return this.http.get<Task>(`${this.url}/${encodeURIComponent(id)}`);
  }

  create(payload: TaskPayload): Observable<Task> {
    return this.http.post<Task>(this.url, payload);
  }

  update(id: string, payload: TaskPayload): Observable<Task> {
    return this.http.put<Task>(`${this.url}/${encodeURIComponent(id)}`, payload);
  }

  changeStatus(id: string, status: TaskStatus): Observable<Task> {
    return this.http.patch<Task>(`${this.url}/${encodeURIComponent(id)}/status`, { status });
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`);
  }
}
