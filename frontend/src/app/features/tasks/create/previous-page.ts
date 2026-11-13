import { sanitizeReturnUrl } from '../../../core/auth/return-url';
import { Browse, classifyBrowse } from '../../../core/navigation/browse-memory';
import { formatDay } from '../task-query';

/** Where the task list lives: the destination when there is no sensible earlier page to return to. */
export const TASK_LIST_URL = '/tasks';

/**
 * The page the user was on before opening the new-task form, so creating (or cancelling) puts them back there:
 * the overview, the day planner on the day they were looking at, a filtered list. Pages that would be pointless to
 * return to (the form itself, sign-in) and anything that is not a same-app path fall back to the task list.
 */
export function pageBeforeCreate(previousUrl: string | null | undefined): string {
  const url = sanitizeReturnUrl(previousUrl);
  const path = url.split(/[?#]/)[0];
  const pointless = url === '/' || path === '/tasks/new' || path.startsWith('/login') || path.startsWith('/register');
  return pointless ? TASK_LIST_URL : url;
}

/**
 * Where to go after saving a task (new or edited): back to where the user was browsing, pointing at the task.
 *  - Opened from the day planner (or from a task page reached from it): the planner, on the day the task starts, with
 *    the task asked for by id so the planner can scroll to its block.
 *  - Opened from the task list (or from a task page reached from it): the list with the same filters and sort, asked for
 *    the task by id so it can open the page that holds it. If the filters hide the task, they are kept anyway.
 *  - Anywhere else (overview, profile): the task list, no filters.
 */
export function whereAfterSave(previousUrl: string | null | undefined, memory: Browse, task: { id: string; startDate: string | null }): string {
  const previous = classifyBrowse(pageBeforeCreate(previousUrl));
  // A task page (detail, edit) in between carries no information about where the user was; the memory does.
  const origin = previous ?? memory;

  if (origin.kind === 'schedule') {
    const params = new URLSearchParams(origin.url.split('?')[1] ?? '');
    const day = task.startDate ? formatDay(new Date(task.startDate)) : params.get('date');
    const next = new URLSearchParams();
    if (day) {
      next.set('date', day);
    }
    next.set('highlight', task.id);
    return `/schedule?${next.toString()}`;
  }

  const params = new URLSearchParams(origin.kind === 'list' ? (origin.url.split('?')[1] ?? '') : '');
  params.delete('page');
  params.set('highlight', task.id);
  return `${TASK_LIST_URL}?${params.toString()}`;
}
