import { FormControl, FormGroup } from '@angular/forms';

import { Task } from '../../../shared/models/task.models';
import {
  EMPTY_TASK_FORM,
  TaskFormValue,
  clockValidator,
  formValueToPayload,
  resolveDuration,
  resolveStart,
  scheduleValidator,
  taskToFormValue,
} from './task-form.model';

const value = (patch: Partial<TaskFormValue> = {}): TaskFormValue => ({ ...EMPTY_TASK_FORM, title: 'Việc', ...patch });

const existing: Task = {
  id: '1', title: 'x', description: null, status: 'Todo', priority: 'Medium', startDate: null,
  dueDate: new Date(2026, 10, 20, 17, 30).toISOString(), durationMinutes: null, isOverdue: false, createdAt: '', updatedAt: '',
};

describe('defaults', () => {
  it('a new task is Todo and Medium with nothing scheduled', () => {
    expect(EMPTY_TASK_FORM).toMatchObject({ status: 'Todo', priority: 'Medium', startDate: null, startTime: '', durationChoice: 'none' });
  });
});

describe('resolveDuration', () => {
  it.each([
    [{ durationChoice: 'none', customMinutes: null }, null],
    [{ durationChoice: '15', customMinutes: null }, 15],
    [{ durationChoice: '30', customMinutes: null }, 30],
    [{ durationChoice: '60', customMinutes: null }, 60],
    [{ durationChoice: '240', customMinutes: null }, 240],
    [{ durationChoice: 'custom', customMinutes: 45 }, 45],
    [{ durationChoice: 'custom', customMinutes: null }, null],
    [{ durationChoice: 'custom', customMinutes: 12.5 }, null],
  ])('%j gives %j', (input, expected) => {
    expect(resolveDuration(input)).toBe(expected);
  });

  it('ignores a typed custom length when a quick choice is selected', () => {
    expect(resolveDuration({ durationChoice: '60', customMinutes: 999 })).toBe(60);
  });
});

describe('resolveStart', () => {
  it('is the chosen day plus the chosen time', () => {
    expect(resolveStart({ startDate: new Date(2026, 10, 12, 18, 40), startTime: '09:30' })).toEqual(new Date(2026, 10, 12, 9, 30));
  });

  it('is the start of the day when no time is given', () => {
    expect(resolveStart({ startDate: new Date(2026, 10, 12, 18, 40), startTime: '' })).toEqual(new Date(2026, 10, 12, 0, 0));
  });

  it('is nothing without a day', () => {
    expect(resolveStart({ startDate: null, startTime: '09:30' })).toBeNull();
  });
});

describe('formValueToPayload', () => {
  it('trims the title and turns a blank description into null so the server clears it', () => {
    expect(formValueToPayload(value({ title: '  Họp  ', description: '   ' }))).toMatchObject({ title: 'Họp', description: null });
    expect(formValueToPayload(value({ description: '  nội dung  ' })).description).toBe('nội dung');
  });

  it('sends the start as a UTC instant with minutes precision', () => {
    const payload = formValueToPayload(value({ startDate: new Date(2026, 10, 12), startTime: '09:45' }));

    expect(new Date(payload.startDate!)).toEqual(new Date(2026, 10, 12, 9, 45));
    expect(payload.startDate).toMatch(/Z$/);
  });

  it('no time chosen means the start of the day, as before', () => {
    expect(new Date(formValueToPayload(value({ startDate: new Date(2026, 10, 12, 15, 45) })).startDate!)).toEqual(new Date(2026, 10, 12, 0, 0));
  });

  it('sends the quick duration as minutes, or null when none', () => {
    expect(formValueToPayload(value({ durationChoice: '120' })).durationMinutes).toBe(120);
    expect(formValueToPayload(value({ durationChoice: 'none' })).durationMinutes).toBeNull();
    expect(formValueToPayload(value({ durationChoice: 'custom', customMinutes: 50 })).durationMinutes).toBe(50);
  });

  it('missing dates are null', () => {
    expect(formValueToPayload(value())).toMatchObject({ startDate: null, dueDate: null, durationMinutes: null });
  });

  it('passes status and priority through', () => {
    expect(formValueToPayload(value({ status: 'InProgress', priority: 'High' }))).toMatchObject({ status: 'InProgress', priority: 'High' });
  });

  describe('the due date', () => {
    it('is never sent for a scheduled task: the server makes it due when its block ends', () => {
      expect(formValueToPayload(value({ startDate: new Date(2026, 10, 12), startTime: '09:00', durationChoice: '60' }), existing).dueDate).toBeNull();
      expect(formValueToPayload(value({ startDate: new Date(2026, 10, 12), startTime: '09:00', durationChoice: '60' })).dueDate).toBeNull();
    });

    it('a task with no start time keeps the due date it already had, so editing does not erase it', () => {
      expect(formValueToPayload(value(), existing).dueDate).toBe(existing.dueDate);
    });

    it('a new task with no start time has no due date', () => {
      expect(formValueToPayload(value()).dueDate).toBeNull();
    });
  });
});

describe('taskToFormValue', () => {
  it('splits the start into a day and an HH:mm time', () => {
    const v = taskToFormValue({ ...existing, startDate: new Date(2026, 10, 12, 9, 5).toISOString() });

    expect(v.startDate).toEqual(new Date(2026, 10, 12, 9, 5));
    expect(v.startTime).toBe('09:05');
  });

  it('a start at exactly midnight still shows 00:00 so it round-trips unchanged', () => {
    const iso = new Date(2026, 10, 12, 0, 0).toISOString();
    const v = taskToFormValue({ ...existing, startDate: iso });

    expect(v.startTime).toBe('00:00');
    expect(formValueToPayload(v).startDate).toBe(iso);
  });

  it.each([[15], [30], [60], [120], [180], [240]])('a %i minute task selects the matching quick choice', (minutes) => {
    expect(taskToFormValue({ ...existing, durationMinutes: minutes })).toMatchObject({ durationChoice: String(minutes), customMinutes: null });
  });

  it.each([[45], [90], [5], [1440]])('a %i minute task, which has no quick choice, uses "Khác" with its minutes', (minutes) => {
    expect(taskToFormValue({ ...existing, durationMinutes: minutes })).toMatchObject({ durationChoice: 'custom', customMinutes: minutes });
  });

  it('a task without a duration selects "Không đặt"', () => {
    expect(taskToFormValue(existing)).toMatchObject({ durationChoice: 'none', customMinutes: null });
  });

  it.each([[null], [15], [90], [240]])('every duration (%j) survives load then save unchanged', (minutes) => {
    const task = { ...existing, startDate: new Date(2026, 10, 12, 9, 0).toISOString(), durationMinutes: minutes };

    expect(formValueToPayload(taskToFormValue(task), task).durationMinutes).toBe(minutes);
    expect(formValueToPayload(taskToFormValue(task), task).startDate).toBe(task.startDate);
  });
});

describe('scheduleValidator', () => {
  const group = (patch: Partial<TaskFormValue>) => {
    const v = { ...EMPTY_TASK_FORM, ...patch };
    const g = new FormGroup({
      startDate: new FormControl(v.startDate), startTime: new FormControl(v.startTime), durationChoice: new FormControl(v.durationChoice),
      customMinutes: new FormControl(v.customMinutes),
    });
    return scheduleValidator()(g);
  };
  const day = new Date(2026, 10, 12);

  it('accepts an empty schedule and a complete one', () => {
    expect(group({})).toBeNull();
    expect(group({ startDate: day, startTime: '09:00', durationChoice: '60' })).toBeNull();
  });

  it('a time needs a day', () => {
    expect(group({ startTime: '09:00' })).toEqual({ timeWithoutDate: true });
  });

  describe('a block must end the same day', () => {
    it.each([
      ['22:00', '120', false], // ends exactly at midnight: fine
      ['23:00', '60', false],
      ['23:00', '61', true],
      ['23:45', '15', false],
      ['23:45', '30', true],
      ['20:00', '240', false], // exactly midnight
      ['20:01', '240', true],
      ['08:00', '240', false],
    ])('start %s for %s minutes crossing midnight = %s', (time, minutes, crosses) => {
      const errors = group({ startDate: day, startTime: time, durationChoice: minutes });

      expect(errors?.['crossesMidnight'] === true).toBe(crosses);
    });

    it('is not asked about when there is no duration or no start time to measure from', () => {
      expect(group({ startDate: day, startTime: '23:59', durationChoice: 'none' })).toBeNull();
    });
  });

  describe('a custom duration', () => {
    it.each([[null, true], [0, true], [-5, true], [1441, true], [12.5, true], [1, false], [45, false], [1440, false]])('%j is invalid = %s', (minutes, invalid) => {
      expect(group({ durationChoice: 'custom', customMinutes: minutes as number | null })?.['customDuration'] === true).toBe(invalid);
    });

    it('is not checked when a quick choice is selected', () => {
      expect(group({ durationChoice: '30', customMinutes: 99999 })).toBeNull();
    });
  });

  it('reports several problems at once', () => {
    expect(group({ startTime: '09:00', durationChoice: 'custom', customMinutes: 0 })).toEqual({ timeWithoutDate: true, customDuration: true });
  });
});

describe('clockValidator', () => {
  it.each([[''], ['  '], ['00:00'], ['09:30'], ['9:05'], ['23:59']])('accepts %j', (text) => {
    expect(clockValidator(new FormControl(text))).toBeNull();
  });

  it.each([['24:00'], ['12:60'], ['abc'], ['9'], ['09:5'], ['25:10']])('rejects %j', (text) => {
    expect(clockValidator(new FormControl(text))).toEqual({ invalidTime: true });
  });
});
