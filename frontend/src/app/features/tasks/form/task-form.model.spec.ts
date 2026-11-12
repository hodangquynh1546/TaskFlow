import { FormControl, FormGroup } from '@angular/forms';

import { Task } from '../../../shared/models/task.models';
import {
  EMPTY_TASK_FORM,
  TaskFormValue,
  clockValidator,
  endOfDay,
  formValueToPayload,
  resolveDuration,
  resolveStart,
  scheduleValidator,
  startOfDay,
  taskToFormValue,
} from './task-form.model';

const value = (patch: Partial<TaskFormValue> = {}): TaskFormValue => ({ ...EMPTY_TASK_FORM, title: 'Việc', ...patch });

const existing: Task = {
  id: '1', title: 'x', description: null, status: 'Todo', priority: 'Medium', startDate: null,
  dueDate: new Date(2026, 10, 20, 17, 30).toISOString(), durationMinutes: null, isOverdue: false, createdAt: '', updatedAt: '',
};

describe('defaults', () => {
  it('a new task is Todo and Medium with nothing scheduled', () => {
    expect(EMPTY_TASK_FORM).toMatchObject({ status: 'Todo', priority: 'Medium', startDate: null, startTime: '', durationChoice: 'none', dueDate: null });
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

  it('a due date picked as a day falls at the end of that local day', () => {
    const payload = formValueToPayload(value({ dueDate: new Date(2026, 10, 12, 8, 15) }));

    expect(new Date(payload.dueDate!)).toEqual(new Date(2026, 10, 12, 23, 59, 0, 0));
  });

  describe('editing a task that already has a due time', () => {
    it('keeps the original time when the day is left alone', () => {
      expect(formValueToPayload(value({ dueDate: new Date(existing.dueDate!) }), existing).dueDate).toBe(new Date(existing.dueDate!).toISOString());
    });

    it('moves to the end of the new day when another day is chosen', () => {
      expect(new Date(formValueToPayload(value({ dueDate: new Date(2026, 10, 25, 9, 0) }), existing).dueDate!)).toEqual(new Date(2026, 10, 25, 23, 59, 0, 0));
    });

    it('clearing the date clears it', () => {
      expect(formValueToPayload(value({ dueDate: null }), existing).dueDate).toBeNull();
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
  const group = (patch: Partial<TaskFormValue>, originalDue: string | null = null) => {
    const v = { ...EMPTY_TASK_FORM, ...patch };
    const g = new FormGroup({
      startDate: new FormControl(v.startDate), startTime: new FormControl(v.startTime), durationChoice: new FormControl(v.durationChoice),
      customMinutes: new FormControl(v.customMinutes), dueDate: new FormControl(v.dueDate),
    });
    return scheduleValidator(() => originalDue)(g);
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

  describe('BR-06: the start must not be after the due moment', () => {
    it('rejects a start after the due day', () => {
      expect(group({ startDate: new Date(2026, 10, 13), startTime: '09:00', dueDate: new Date(2026, 10, 12) })).toEqual({ dateOrder: true });
    });

    it('accepts the same day, since a due day means the end of that day', () => {
      expect(group({ startDate: day, startTime: '23:00', dueDate: day })).toBeNull();
    });

    it('is judged against the due time the task already has when its day is unchanged', () => {
      const dueAt0800 = new Date(2026, 10, 12, 8, 0).toISOString();

      expect(group({ startDate: day, startTime: '15:00', dueDate: new Date(dueAt0800) }, dueAt0800)).toEqual({ dateOrder: true });
      expect(group({ startDate: day, startTime: '07:00', dueDate: new Date(dueAt0800) }, dueAt0800)).toBeNull();
    });

    it('is satisfied when either is missing', () => {
      expect(group({ startDate: day, startTime: '09:00' })).toBeNull();
      expect(group({ dueDate: day })).toBeNull();
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

describe('day helpers', () => {
  it('startOfDay clears the time, endOfDay is 23:59 of the same local day', () => {
    expect(startOfDay(new Date(2026, 10, 12, 18, 30, 15, 500))).toEqual(new Date(2026, 10, 12, 0, 0, 0, 0));
    expect(endOfDay(new Date(2026, 10, 12, 3, 4))).toEqual(new Date(2026, 10, 12, 23, 59, 0, 0));
  });
});
