export type PlannerView = 'day' | 'week';

const KEY = 'tf.planner.view';

/**
 * The view (day or week) the user last chose on the planner. Opening the planner from the menu has no view in its
 * address, and without this it would always fall back to the day, throwing away the week they were working in. Browser
 * storage can be blocked or empty, so any failure just means "day".
 */
export function readViewPreference(): PlannerView {
  try {
    return localStorage.getItem(KEY) === 'week' ? 'week' : 'day';
  } catch {
    return 'day';
  }
}

export function saveViewPreference(view: PlannerView): void {
  try {
    localStorage.setItem(KEY, view);
  } catch {
    // Not remembered, which only costs the convenience.
  }
}
