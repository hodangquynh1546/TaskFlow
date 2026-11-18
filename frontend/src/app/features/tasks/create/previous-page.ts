import { sanitizeReturnUrl } from '../../../core/auth/return-url';
import { Browse, backTarget, classifyBrowse } from '../../../core/navigation/browse-memory';
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
 *  - Opened from the overview or the profile (or from a task page reached from them): back to that page, as it was.
 *  - Anywhere else: the task list, no filters.
 */
export function whereAfterSave(previousUrl: string | null | undefined, memory: Browse, task: { id: string; startDate: string | null }): string {
  const previous = classifyBrowse(pageBeforeCreate(previousUrl));
  // A task page (detail, edit) in between carries no information about where the user was; the memory does.
  const origin = previous ?? memory;

  if (origin.kind === 'page') {
    return origin.url;
  }

  if (origin.kind === 'schedule') {
    return plannerUrl(origin.url, task, task.id);
  }

  const params = new URLSearchParams(origin.kind === 'list' ? (origin.url.split('?')[1] ?? '') : '');
  params.delete('page');
  params.set('highlight', task.id);
  return `${TASK_LIST_URL}?${params.toString()}`;
}

/**
 * The planner address for a task: the same view (day or week) the user was in, on the day the task starts (or on the day
 * they were looking at when it has no start time). `highlight` asks the planner to scroll to the task's block.
 */
function plannerUrl(plannerUrlBefore: string, task: { startDate: string | null }, highlight?: string): string {
  const params = new URLSearchParams(plannerUrlBefore.split('?')[1] ?? '');
  const day = task.startDate ? formatDay(new Date(task.startDate)) : params.get('date');
  const next = new URLSearchParams();
  // The week view must survive: the task lands in its own place in the week, not on a single day.
  if (params.get('view') === 'week') {
    next.set('view', 'week');
  }
  if (day) {
    next.set('date', day);
  }
  if (highlight) {
    next.set('highlight', highlight);
  }
  const query = next.toString();
  return query ? `/schedule?${query}` : '/schedule';
}

/**
 * Where to go after deleting a task opened from the planner: the planner in the same view, on the day the task was on,
 * which is where its block used to be. From anywhere else, the page it was opened from.
 */
export function whereAfterDelete(memory: Browse, task: { startDate: string | null }): string {
  return memory.kind === 'schedule' ? plannerUrl(memory.url, task) : backTarget(memory).url;
}
