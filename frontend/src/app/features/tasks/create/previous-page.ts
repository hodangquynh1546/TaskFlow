import { sanitizeReturnUrl } from '../../../core/auth/return-url';

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
