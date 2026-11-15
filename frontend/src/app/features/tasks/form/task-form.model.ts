import { AbstractControl, ValidationErrors } from '@angular/forms';

import { RecurrenceFrequency, Task, TaskPayload, TaskPriority, TaskStatus } from '../../../shared/models/task.models';
import {
  DURATION_PRESETS,
  MAX_DURATION_MINUTES,
  combineDateAndTime,
  crossesMidnight,
  formatClock,
  isValidClock,
} from '../../../shared/util/duration';

/** The shape the form edits. Dates are real Date objects because that is what the date picker produces. */
export interface TaskFormValue {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** The day the task starts. */
  startDate: Date | null;
  /** "HH:mm" typed into the time box; empty means no time was chosen (the start of the day). */
  startTime: string;
  /** "none", "custom", or the number of minutes of a quick choice as text ("30"). */
  durationChoice: string;
  /** Minutes typed when the choice is "custom". */
  customMinutes: number | null;
  /** "none", or how often it repeats. */
  repeat: 'none' | RecurrenceFrequency;
  /** Every N days, weeks, months or years. */
  repeatEvery: number | null;
  /** Bit mask of weekdays for a weekly repeat (Monday = 1 ... Sunday = 64); 0 = the weekday of the start. */
  repeatDays: number;
  /** The last day the task may repeat on. */
  repeatUntil: Date | null;
}

export const MAX_REPEAT_EVERY = 99;

export const EMPTY_TASK_FORM: TaskFormValue = {
  title: '',
  description: '',
  priority: 'Medium', // BR-05
  status: 'Todo', // BR-04
  startDate: null,
  startTime: '',
  durationChoice: 'none',
  customMinutes: null,
  repeat: 'none',
  repeatEvery: 1,
  repeatDays: 0,
  repeatUntil: null,
};

export function taskToFormValue(task: Task): TaskFormValue {
  const start = task.startDate ? new Date(task.startDate) : null;
  const minutes = task.durationMinutes;
  const preset = minutes !== null && DURATION_PRESETS.includes(minutes);
  return {
    title: task.title,
    description: task.description ?? '',
    priority: task.priority,
    status: task.status,
    startDate: start,
    startTime: start ? formatClock(start) : '',
    durationChoice: minutes === null ? 'none' : preset ? String(minutes) : 'custom',
    customMinutes: minutes !== null && !preset ? minutes : null,
    repeat: task.recurrence?.frequency ?? 'none',
    repeatEvery: task.recurrence?.interval ?? 1,
    repeatDays: task.recurrence?.weekdays ?? 0,
    repeatUntil: task.recurrence?.until ? new Date(task.recurrence.until) : null,
  };
}

/** The length in minutes the form currently describes, or null for none. NaN-safe: an unusable custom value is null. */
export function resolveDuration(value: Pick<TaskFormValue, 'durationChoice' | 'customMinutes'>): number | null {
  if (value.durationChoice === 'none') {
    return null;
  }
  if (value.durationChoice === 'custom') {
    const custom = value.customMinutes;
    return custom !== null && Number.isInteger(custom) ? custom : null;
  }
  return Number(value.durationChoice);
}

/** The moment the task starts: the chosen day plus the chosen time (the start of the day when no time is given). */
export function resolveStart(value: Pick<TaskFormValue, 'startDate' | 'startTime'>): Date | null {
  return value.startDate ? combineDateAndTime(value.startDate, value.startTime) : null;
}

/**
 * The repeat to send, or null. A repeat only exists together with a start time (there is nothing to repeat from
 * otherwise); its offset is the user's own, read from the start, so weekdays mean the weekdays where they are.
 */
export function resolveRepeat(value: TaskFormValue, start: Date | null): TaskPayload['recurrence'] {
  if (value.repeat === 'none' || start === null) {
    return null;
  }
  const until = value.repeatUntil;
  return {
    frequency: value.repeat,
    interval: value.repeatEvery ?? 1,
    weekdays: value.repeat === 'Weekly' ? value.repeatDays : 0,
    // A day is picked; the series may still repeat on that whole day.
    until: until ? new Date(until.getFullYear(), until.getMonth(), until.getDate(), 23, 59, 0, 0).toISOString() : null,
    utcOffsetMinutes: -start.getTimezoneOffset(),
  };
}

/**
 * Trims text, turns an empty description into null (which clears it on the server) and sends moments as UTC instants.
 * There is no due date to send: the server makes a scheduled task due when its block ends. A task with no start time that
 * already has a due date from before keeps it, because this form can no longer set it and must not silently erase it.
 */
export function formValueToPayload(value: TaskFormValue, original: Task | null = null): TaskPayload {
  const description = value.description.trim();
  const start = resolveStart(value);
  return {
    title: value.title.trim(),
    description: description === '' ? null : description,
    priority: value.priority,
    status: value.status,
    startDate: start ? start.toISOString() : null,
    dueDate: start ? null : (original?.dueDate ?? null),
    durationMinutes: resolveDuration(value),
    recurrence: resolveRepeat(value, start),
  };
}

/**
 * Rules that involve several fields, for instant feedback only (the server enforces the real ones):
 *  - a time needs a day to belong to,
 *  - a custom length must be a whole number of minutes from 1 to 1440,
 *  - the block must end the same day it starts (work is planned inside a day),
 *  - a repeat needs a start day, a whole-number interval from 1 to 99, and an end day that is not before the start.
 */
export function scheduleValidator() {
  return (group: AbstractControl): ValidationErrors | null => {
    const value = group.getRawValue() as TaskFormValue;
    const errors: ValidationErrors = {};

    if (value.startDate === null && value.startTime.trim() !== '') {
      errors['timeWithoutDate'] = true;
    }

    if (value.durationChoice === 'custom') {
      const custom = value.customMinutes;
      if (custom === null || !Number.isInteger(custom) || custom < 1 || custom > MAX_DURATION_MINUTES) {
        errors['customDuration'] = true;
      }
    }

    const start = resolveStart(value);
    const minutes = resolveDuration(value);
    if (start && minutes !== null && minutes >= 1 && minutes <= MAX_DURATION_MINUTES && crossesMidnight(start, minutes)) {
      errors['crossesMidnight'] = true;
    }

    if (value.repeat !== 'none') {
      if (value.startDate === null) {
        errors['repeatNeedsStart'] = true;
      }
      const every = value.repeatEvery;
      if (every === null || !Number.isInteger(every) || every < 1 || every > MAX_REPEAT_EVERY) {
        errors['repeatEvery'] = true;
      }
      if (value.repeatUntil && value.startDate && startOfLocalDay(value.repeatUntil) < startOfLocalDay(value.startDate)) {
        errors['repeatUntilBeforeStart'] = true;
      }
    }
    return Object.keys(errors).length ? errors : null;
  };
}

const startOfLocalDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export function clockValidator(control: AbstractControl): ValidationErrors | null {
  const text = typeof control.value === 'string' ? control.value.trim() : '';
  return text === '' || isValidClock(text) ? null : { invalidTime: true };
}
