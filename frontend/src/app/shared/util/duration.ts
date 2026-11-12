import { Translate, viTranslate } from '../../core/i18n/translate';

/** The lengths offered as one-tap choices, in minutes: 15 min, 30 min, 1h, 2h, 3h, 4h. */
export const DURATION_PRESETS: readonly number[] = [15, 30, 60, 120, 180, 240];

export const MAX_DURATION_MINUTES = 24 * 60;

/** "15 phút", "1 giờ", "1 giờ 30 phút" (or the active language's equivalent). Pure so every shape is tested. */
export function formatDuration(minutes: number, t: Translate = viTranslate): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return t('duration.minutes', { n: rest });
  }
  return rest === 0 ? t('duration.hours', { n: hours }) : t('duration.hoursMinutes', { h: hours, m: rest });
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local "HH:mm" of an instant. */
export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function blockEnd(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60_000);
}

/** "09:00–10:30", or just "09:00" when the length is unknown. */
export function formatTimeRange(startIso: string, minutes: number | null): string {
  const start = new Date(startIso);
  return minutes === null ? formatClock(start) : `${formatClock(start)}–${formatClock(blockEnd(start, minutes))}`;
}

/**
 * Work is planned inside one day: a block may not run past local midnight. Ending exactly at midnight (22:00 for
 * two hours) is fine; that is the end of the day, not the next one.
 */
export function crossesMidnight(start: Date, minutes: number): boolean {
  const nextMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1, 0, 0, 0, 0);
  return blockEnd(start, minutes).getTime() > nextMidnight.getTime();
}

/** A local date and an "HH:mm" text become one moment. No time chosen means the start of the day. */
export function combineDateAndTime(date: Date, time: string | null | undefined): Date {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  const hours = match ? Number(match[1]) : 0;
  const minutes = match ? Number(match[2]) : 0;
  const valid = hours <= 23 && minutes <= 59;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), valid ? hours : 0, valid ? minutes : 0, 0, 0);
}

export function isValidClock(time: string | null | undefined): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec((time ?? '').trim());
  return match !== null && Number(match[1]) <= 23 && Number(match[2]) <= 59;
}
