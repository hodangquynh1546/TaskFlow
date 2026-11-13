import { formatDay } from '../../tasks/task-query';
import { ReportPeriod } from '../dashboard.service';

const NICE = [1, 2, 4, 6, 8, 10];

/**
 * The smallest "round" axis maximum (1, 2, 4, 6, 8 or 10 times a power of ten) that fits the value, never below
 * `minimum`. Round maxima keep the middle gridline on a round number too.
 */
export function niceCeil(value: number, minimum = 1): number {
  const target = Math.max(value, minimum);
  const power = 10 ** Math.floor(Math.log10(target));
  for (const step of NICE) {
    if (step * power >= target - 1e-9) {
      return step * power;
    }
  }
  return 10 * power;
}

/** A day inside the period `back` periods before the current one (0 = the current one), as "yyyy-MM-dd". */
export function periodAnchor(today: Date, period: ReportPeriod, back: number): string {
  switch (period) {
    case 'week':
      return formatDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7 * back));
    case 'month':
      return formatDay(new Date(today.getFullYear(), today.getMonth() - back, 1));
    default:
      return formatDay(new Date(today.getFullYear() - back, 0, 1));
  }
}
