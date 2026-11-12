import { Translate, viTranslate } from '../../core/i18n/translate';
import { TaskStatus } from '../models/task.models';

export type DueKind = 'none' | 'done' | 'overdue' | 'soon' | 'normal';

export interface DueDescription {
  kind: DueKind;
  /** Short text shown in lists, e.g. "Quá hạn 2 ngày" or "Hạn 20/11/2026". */
  text: string;
  /** Full date and time for tooltips and screen readers. */
  title: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SOON_WINDOW = 2 * DAY;

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local date, plus the time unless it is the end of the day (the form's "no time chosen" default is 23:59). */
export function formatDue(date: Date, locale = 'vi-VN'): string {
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  const endOfDay = date.getHours() === 23 && date.getMinutes() === 59;
  return endOfDay ? day : `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * BR-09: overdue means strictly past the due time and not completed. A task due exactly now is not overdue.
 * Within 48 hours of the deadline it is "soon". Pure, so the boundaries are unit-tested exactly.
 */
export function describeDue(
  dueDate: string | null,
  status: TaskStatus,
  now: Date = new Date(),
  t: Translate = viTranslate,
  locale = 'vi-VN',
): DueDescription {
  if (dueDate === null) {
    return { kind: 'none', text: t('due.none'), title: t('due.noneTitle') };
  }

  const due = new Date(dueDate);
  const formatted = formatDue(due, locale);
  const title = t('due.title', { date: formatted });

  if (status === 'Completed') {
    return { kind: 'done', text: t('due.at', { date: formatted }), title };
  }

  const diff = due.getTime() - now.getTime();

  if (diff < 0) {
    const late = -diff;
    if (late < HOUR) {
      return { kind: 'overdue', text: t('due.lateMinutes', { n: Math.max(1, Math.floor(late / MINUTE)) }), title };
    }
    if (late < DAY) {
      return { kind: 'overdue', text: t('due.lateHours', { n: Math.floor(late / HOUR) }), title };
    }
    return { kind: 'overdue', text: t('due.lateDays', { n: Math.floor(late / DAY) }), title };
  }

  if (diff <= SOON_WINDOW) {
    if (diff < HOUR) {
      return { kind: 'soon', text: t('due.leftMinutes', { n: Math.max(1, Math.floor(diff / MINUTE)) }), title };
    }
    if (diff < DAY) {
      return { kind: 'soon', text: t('due.leftHours', { n: Math.floor(diff / HOUR) }), title };
    }
    return { kind: 'soon', text: t('due.leftDays', { n: Math.floor(diff / DAY) }), title };
  }

  return { kind: 'normal', text: t('due.at', { date: formatted }), title };
}
