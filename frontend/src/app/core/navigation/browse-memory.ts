import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/** The last page the user was browsing: the task list with its filters, the day planner on its day, or neither. */
export type Browse = { kind: 'list'; url: string } | { kind: 'schedule'; url: string } | { kind: 'other' };

const OTHER: Browse = { kind: 'other' };

/**
 * Sorts a URL into what it means for "where was the user": the list and the planner are remembered with their query,
 * the overview and the profile reset it, and the task pages themselves (detail, edit, new) say nothing, so the
 * memory survives the trip through them. Pure, so every case is tested.
 */
export function classifyBrowse(url: string): Browse | null {
  const [path, query = ''] = url.split('#')[0].split('?');
  if (path === '/tasks' || path === '/schedule') {
    const params = new URLSearchParams(query);
    // `highlight` is a one-time request to point at a task, not part of what the user was looking at.
    params.delete('highlight');
    const rest = params.toString();
    return { kind: path === '/tasks' ? 'list' : 'schedule', url: rest ? `${path}?${rest}` : path };
  }
  return path.startsWith('/tasks/') ? null : OTHER;
}

/** Remembers where the user was browsing, so saving a task can put them back there even after a visit to the task's own page. */
@Injectable({ providedIn: 'root' })
export class BrowseMemory {
  private readonly current = signal<Browse>(OTHER);
  readonly last = this.current.asReadonly();

  constructor() {
    inject(Router)
      .events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.note(event.urlAfterRedirects));
  }

  note(url: string): void {
    const browse = classifyBrowse(url);
    if (browse) {
      this.current.set(browse);
    }
  }
}
