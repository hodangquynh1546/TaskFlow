import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

import { MessageKey } from '../i18n/messages/vi';

/**
 * The last page the user was browsing: the task list with its filters, the planner on its day or week, the overview or
 * the profile, or none of them.
 */
export type Browse = { kind: 'list'; url: string } | { kind: 'schedule'; url: string } | { kind: 'page'; url: string } | { kind: 'other' };

const OTHER: Browse = { kind: 'other' };

/**
 * Sorts a URL into what it means for "where was the user": the list and the planner are remembered with their query,
 * the overview and the profile are remembered as themselves, anything else (sign-in, unknown pages) resets it, and the
 * task pages themselves (detail, edit, new) say nothing, so the memory survives the trip through them. Pure, so every
 * case is tested.
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
  if (path === '/dashboard' || path === '/profile') {
    return { kind: 'page', url: path };
  }
  return path.startsWith('/tasks/') ? null : OTHER;
}

/**
 * Where the back link of a task page, and the end of deleting a task, lead: the page the user opened the task from,
 * with its filters, day or week. With nothing remembered (the task was opened by a link or a reload) the task list.
 */
export function backTarget(browse: Browse): { url: string; labelKey: MessageKey } {
  switch (browse.kind) {
    case 'list':
      return { url: browse.url, labelKey: 'nav.tasks' };
    case 'schedule':
      return { url: browse.url, labelKey: 'nav.schedule' };
    case 'page':
      return { url: browse.url, labelKey: browse.url === '/profile' ? 'nav.profile' : 'nav.dashboard' };
    default:
      return { url: '/tasks', labelKey: 'nav.tasks' };
  }
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
