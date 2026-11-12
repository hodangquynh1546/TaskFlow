import { DestroyRef, Signal, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { BehaviorSubject, EMPTY, combineLatest, switchMap, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiError } from '../../core/http/api-error';
import { Task } from '../../shared/models/task.models';
import { TaskService } from './task.service';

export type ResourceState = 'loading' | 'ready' | 'notFound' | 'error';

/**
 * Loads one task whenever the id changes. A 404 is a normal outcome ("deleted or never yours"), not a failure,
 * so it gets its own state and its own message instead of the generic error screen.
 * Must be created in an injection context.
 */
export function createTaskResource(id: Signal<string>, tasks: TaskService, destroyRef: DestroyRef) {
  const state = signal<ResourceState>('loading');
  const task = signal<Task | null>(null);
  const error = signal<ApiError | null>(null);
  const reload$ = new BehaviorSubject<void>(undefined);

  combineLatest([toObservable(id), reload$])
    .pipe(
      tap(() => state.set('loading')),
      switchMap(([taskId]) =>
        tasks.get(taskId).pipe(
          catchError((e: ApiError) => {
            error.set(e);
            state.set(e.status === 404 ? 'notFound' : 'error');
            return EMPTY;
          }),
        ),
      ),
      takeUntilDestroyed(destroyRef),
    )
    .subscribe((loaded) => {
      task.set(loaded);
      error.set(null);
      state.set('ready');
    });

  return { state, task, error, reload: () => reload$.next(), set: (t: Task) => task.set(t) };
}
