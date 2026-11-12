import { Translate, viTranslate } from '../../core/i18n/translate';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Days between two instants by local calendar date, so 23:50 yesterday is "Hôm qua" even though it was only 20 minutes ago. */
function calendarDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / (24 * HOUR));
}

/** "10 minutes ago", "Yesterday", "3 days ago", then a plain date. Pure so every boundary is tested. */
export function relativeTime(iso: string, now: Date = new Date(), t: Translate = viTranslate, locale = 'vi-VN'): string {
  const then = new Date(iso);
  const diff = now.getTime() - then.getTime();

  if (diff < 45_000) {
    return t('time.justNow'); // also covers small clock differences that put the timestamp slightly in the future
  }
  if (diff < HOUR) {
    return t('time.minutesAgo', { n: Math.max(1, Math.floor(diff / MINUTE)) });
  }
  const days = calendarDaysBetween(then, now);
  if (days === 0) {
    return t('time.hoursAgo', { n: Math.floor(diff / HOUR) });
  }
  if (days === 1) {
    return t('time.yesterday');
  }
  if (days < 7) {
    return t('time.daysAgo', { n: days });
  }
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(then);
}
