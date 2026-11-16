import { MessageParams } from '../../core/i18n/i18n.service';
import { MessageKey } from '../../core/i18n/messages/vi';
import { STATUS_KEYS } from '../../shared/models/task.models';
import { formatDuration } from '../../shared/util/duration';
import { ScheduledBlock } from './schedule-layout';

type Translate = (key: MessageKey, params?: MessageParams) => string;

const pad = (n: number): string => String(n).padStart(2, '0');

/** "09:30" for a minute of the day; 24:00 (the end of the day) wraps to 00:00 only on the axis, never in a block's end. */
export function clock(minute: number): string {
  return `${pad(Math.floor(minute / 60) % 24)}:${pad(minute % 60)}`;
}

/** What a screen reader says for a block: title, times, length and status, so colour is never the only carrier. */
export function blockLabel(block: ScheduledBlock, t: Translate): string {
  const task = block.task;
  const length = task.durationMinutes === null ? t('schedule.noLength') : formatDuration(task.durationMinutes, t);
  return t('schedule.blockLabel', { title: task.title, from: clock(block.startMinute), to: clock(block.endMinute), length, status: t(STATUS_KEYS[task.status]) });
}
