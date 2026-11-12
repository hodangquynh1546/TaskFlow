import { Translate, viTranslate } from '../../core/i18n/translate';
import { Task } from '../models/task.models';
import { blockEnd, formatClock, formatDuration } from './duration';

export interface TimeBlockDescription {
  /** Where it sits in time: "12/11, 09:00–10:30", "12/11, 09:00", or "Dự kiến" when only a length is known. */
  when: string;
  /** "1 giờ 30 phút" when the task has a length. */
  duration: string | null;
  /** One sentence with everything, for tooltips and screen readers. */
  title: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function dayLabel(date: Date, now: Date, locale: string): string {
  const base = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
    .formatToParts(date)
    .filter((part) => part.type === 'day' || part.type === 'month')
    .map((part) => part.value)
    .join('/');
  return date.getFullYear() === now.getFullYear() ? base : `${base}/${date.getFullYear()}`;
}

/** The planned block of a task, or null when it has neither a start time nor a length. */
export function describeTimeBlock(
  task: Pick<Task, 'startDate' | 'durationMinutes'>,
  now: Date = new Date(),
  t: Translate = viTranslate,
  locale = 'vi-VN',
): TimeBlockDescription | null {
  const minutes = task.durationMinutes;
  const duration = minutes === null ? null : formatDuration(minutes, t);

  if (task.startDate === null) {
    return minutes === null ? null : { when: t('block.planned'), duration, title: t('block.plannedTitle', { duration: duration ?? '' }) };
  }

  const start = new Date(task.startDate);
  const range = minutes === null ? formatClock(start) : `${formatClock(start)}–${formatClock(blockEnd(start, minutes))}`;
  const when = `${dayLabel(start, now, locale)}, ${range}`;
  return { when, duration, title: duration ? `${when} (${duration})` : when };
}
