import { TestBed } from '@angular/core/testing';

import { ApiError } from '../../../core/http/api-error';
import { Task } from '../../../shared/models/task.models';
import { UI_TEST_PROVIDERS, aTask } from '../test-support';
import { TaskFormComponent } from './task-form.component';

function setup(inputs: { task?: Task | null; saving?: boolean } = {}) {
  TestBed.configureTestingModule({ providers: UI_TEST_PROVIDERS });
  const fixture = TestBed.createComponent(TaskFormComponent);
  fixture.componentRef.setInput('submitLabel', 'Tạo công việc');
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  fixture.detectChanges();
  const component = fixture.componentInstance;
  const el = fixture.nativeElement as HTMLElement;
  const saved = vi.fn();
  const cancelled = vi.fn();
  component.save.subscribe(saved);
  component.cancelled.subscribe(cancelled);

  const form = component['form'];
  const submit = () => {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const set = (patch: Record<string, unknown>) => {
    form.patchValue(patch);
    fixture.detectChanges();
  };
  return { fixture, component, el, form, saved, cancelled, submit, set, text: () => el.textContent ?? '' };
}

describe('TaskFormComponent', () => {
  it('starts a new task with Todo and Medium and everything else empty', () => {
    const { form } = setup();

    expect(form.getRawValue()).toEqual({
      title: '', description: '', priority: 'Medium', status: 'Todo', startDate: null, startTime: '', durationChoice: 'none', customMinutes: null, dueDate: null,
    });
  });

  it('labels the primary button as the page asks', () => {
    const { el } = setup();

    expect(el.querySelector('button[type="submit"]')!.textContent).toContain('Tạo công việc');
  });

  it('offers all three priorities as radio buttons with Vietnamese labels, Medium selected', () => {
    const { el } = setup();
    const labels = [...el.querySelectorAll('label[nz-radio]')].map((l) => l.textContent!.trim());

    expect(labels).toEqual(['Thấp', 'Trung bình', 'Cao']);
    expect(el.querySelector('label[nz-radio].ant-radio-wrapper-checked')!.textContent).toContain('Trung bình');
  });

  it('asks for the due date as a day only: choosing it is complete, with no extra confirm step to forget', () => {
    const { el } = setup();

    expect(el.querySelector('#dueDate')).not.toBeNull();
    expect(el.querySelector('.ant-picker-ok')).toBeNull();
  });

  describe('the Enter key', () => {
    const press = (target: Element) => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    };

    it('in a date picker only accepts the typed date; it never submits the form (which would drop the date)', () => {
      const { el } = setup();

      expect(press(el.querySelector('#dueDate')!).defaultPrevented).toBe(true);
      expect(press(el.querySelector('#startDate')!).defaultPrevented).toBe(true);
    });

    it('in the title still submits the form as usual', () => {
      const { el } = setup();

      expect(press(el.querySelector('#title')!).defaultPrevented).toBe(false);
    });

    it('in the description still adds a new line', () => {
      const { el } = setup();

      expect(press(el.querySelector('#description')!).defaultPrevented).toBe(false);
    });
  });

  describe('validation', () => {
    it('requires a title and does not emit without one', () => {
      const { submit, saved, text } = setup();

      submit();

      expect(text()).toContain('Vui lòng nhập tiêu đề.');
      expect(saved).not.toHaveBeenCalled();
    });

    it('treats a whitespace-only title as missing', () => {
      const { submit, set, saved, text } = setup();
      set({ title: '    ' });

      submit();

      expect(text()).toContain('Vui lòng nhập tiêu đề.');
      expect(saved).not.toHaveBeenCalled();
    });

    it('allows a 200 character title and rejects 201', () => {
      const { submit, set, saved, text } = setup();

      set({ title: 'a'.repeat(201) });
      submit();
      expect(text()).toContain('Tiêu đề tối đa 200 ký tự.');
      expect(saved).not.toHaveBeenCalled();

      set({ title: 'a'.repeat(200) });
      submit();
      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('allows a 5000 character description and rejects 5001', () => {
      const { submit, set, saved, text } = setup();
      set({ title: 'Việc' });

      set({ description: 'd'.repeat(5001) });
      submit();
      expect(text()).toContain('Mô tả tối đa 5000 ký tự.');
      expect(saved).not.toHaveBeenCalled();

      set({ description: 'd'.repeat(5000) });
      submit();
      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('rejects a due date before the start day, explaining it under the due date, and accepts it once fixed', () => {
      const { submit, set, saved, text } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 13), startTime: '09:00', dueDate: new Date(2026, 10, 12, 17, 0) });

      submit();
      expect(text()).toContain('Hạn hoàn thành không được trước giờ bắt đầu.');
      expect(saved).not.toHaveBeenCalled();

      set({ dueDate: new Date(2026, 10, 13, 17, 0) });
      submit();
      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('accepts the same day for start and due', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 12), dueDate: new Date(2026, 10, 12, 8, 0) });

      submit();

      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('accepts either date on its own', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 12) });
      submit();
      set({ startDate: null, dueDate: new Date(2020, 0, 1) }); // a past due date is allowed
      submit();

      expect(saved).toHaveBeenCalledTimes(2);
    });
  });

  describe('submitting', () => {
    it('emits a trimmed, UTC-based payload with the due date at the end of its day', () => {
      const { submit, set, saved } = setup();
      const due = new Date(2026, 10, 20, 17, 30);
      set({ title: '  Họp nhóm  ', description: '  chuẩn bị slide  ', priority: 'High', status: 'InProgress', startDate: new Date(2026, 10, 18), startTime: '14:00', durationChoice: '60', dueDate: due });

      submit();

      expect(saved).toHaveBeenCalledWith({
        title: 'Họp nhóm',
        description: 'chuẩn bị slide',
        priority: 'High',
        status: 'InProgress',
        startDate: new Date(2026, 10, 18, 14, 0, 0, 0).toISOString(),
        dueDate: new Date(2026, 10, 20, 23, 59, 0, 0).toISOString(),
        durationMinutes: 60,
      });
    });

    it('a blank description becomes null so editing can clear it', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Việc', description: '   ' });

      submit();

      expect(saved.mock.calls[0][0].description).toBeNull();
    });

    it('shows the button as busy while saving', () => {
      const { el } = setup({ saving: true });

      expect(el.querySelector('button[type="submit"]')!.classList.contains('ant-btn-loading')).toBe(true);
    });

    it('cancel emits and never saves', () => {
      const { el, cancelled, saved } = setup();

      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Hủy')!.click();

      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(saved).not.toHaveBeenCalled();
    });
  });

  describe('editing an existing task', () => {
    it('saving without touching the due day keeps the task\'s own due time', () => {
      const due = new Date(2026, 10, 20, 17, 30).toISOString();
      const { submit, saved } = setup({ task: aTask({ dueDate: due }) });

      submit();

      expect(saved.mock.calls[0][0].dueDate).toBe(due);
    });

    it('fills every field from the task', () => {
      const due = '2026-11-20T10:00:00Z';
      const { form } = setup({ task: aTask({ title: 'Cũ', description: null, status: 'InProgress', priority: 'High', startDate: '2026-11-18T00:00:00Z', dueDate: due }) });

      expect(form.getRawValue()).toMatchObject({ title: 'Cũ', description: '', status: 'InProgress', priority: 'High' });
      expect(form.getRawValue().dueDate).toEqual(new Date(due));
    });

    it('reloads the form when a different task arrives', () => {
      const { fixture, form } = setup({ task: aTask({ title: 'Một' }) });

      fixture.componentRef.setInput('task', aTask({ id: 't2', title: 'Hai' }));
      fixture.detectChanges();

      expect(form.getRawValue().title).toBe('Hai');
    });

    it('does not overwrite what the user is typing when the page re-renders', () => {
      const { fixture, form, set } = setup({ task: aTask({ title: 'Gốc' }) });

      set({ title: 'Đang gõ dở' });
      fixture.detectChanges();

      expect(form.getRawValue().title).toBe('Đang gõ dở');
    });
  });

  describe('server errors', () => {
    it('puts a field message on its field and clears it when that field is edited', () => {
      const { component, fixture, set, text } = setup();
      set({ title: 'Việc' });

      component.showServerError(new ApiError(400, 'x', { title: ['Tiêu đề không được để trống.'] }));
      fixture.detectChanges();
      expect(text()).toContain('Tiêu đề không được để trống.');

      set({ title: 'Việc khác' });
      expect(text()).not.toContain('Tiêu đề không được để trống.');
    });

    it('a start-date message from the server appears under the start date', () => {
      const { component, fixture, el } = setup();

      component.showServerError(new ApiError(400, 'x', { startDate: ['Ngày bắt đầu không được sau hạn hoàn thành.'] }));
      fixture.detectChanges();

      expect(el.querySelector('nz-form-control:has(#startDate)')!.textContent).toContain('Ngày bắt đầu không được sau hạn hoàn thành.');
    });

    it('a failure with no field shows its message above the buttons', () => {
      const { component, fixture, el } = setup();

      component.showServerError(new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.'));
      fixture.detectChanges();

      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Có lỗi từ máy chủ');
    });

    it('a field the form does not have is shown above the buttons instead of being lost', () => {
      const { component, fixture, el } = setup();

      component.showServerError(new ApiError(400, 'x', { body: ['Nội dung yêu cầu không hợp lệ.'] }));
      fixture.detectChanges();

      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Nội dung yêu cầu không hợp lệ.');
    });
  });

  describe('time and duration', () => {
    const optionLabels = (el: HTMLElement) => [...el.querySelectorAll('nz-radio-group.durations label[nz-radio-button]')].map((l) => l.textContent!.trim());

    it('has a start time box, a native time input that needs no confirm step', () => {
      const { el } = setup();
      const time = el.querySelector<HTMLInputElement>('#startTime')!;

      expect(time.type).toBe('time');
      expect(el.querySelector('label[for="startTime"]')!.textContent).toContain('Giờ bắt đầu');
    });

    it('offers the quick lengths: none, 15 and 30 minutes, 1 to 4 hours, and other', () => {
      expect(optionLabels(setup().el)).toEqual(['Không đặt', '15 phút', '30 phút', '1 giờ', '2 giờ', '3 giờ', '4 giờ', 'Khác']);
    });

    it('starts with no duration chosen', () => {
      expect(setup().el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toContain('Không đặt');
    });

    it('shows the minutes box only for "Khác"', () => {
      const { el, set, fixture } = setup();
      expect(el.querySelector('#customMinutes')).toBeNull();

      set({ durationChoice: 'custom' });
      fixture.detectChanges();
      expect(el.querySelector('#customMinutes')).not.toBeNull();

      set({ durationChoice: '30' });
      fixture.detectChanges();
      expect(el.querySelector('#customMinutes')).toBeNull();
    });

    it('says when the block ends once it knows the start and the length', () => {
      const { el, set, fixture } = setup();
      expect(el.textContent).not.toContain('Kết thúc lúc');

      set({ startDate: new Date(2026, 10, 12), startTime: '09:00', durationChoice: '90' === '90' ? 'custom' : 'none', customMinutes: 90 });
      fixture.detectChanges();

      expect(el.textContent).toContain('Kết thúc lúc 10:30');
    });

    it('shows the end for a quick choice too, and nothing without a start time or a length', () => {
      const { el, set, fixture } = setup();

      set({ startDate: new Date(2026, 10, 12), startTime: '14:15', durationChoice: '15' });
      fixture.detectChanges();
      expect(el.textContent).toContain('Kết thúc lúc 14:30');

      set({ durationChoice: 'none' });
      fixture.detectChanges();
      expect(el.textContent).not.toContain('Kết thúc lúc');
    });

    it('refuses a block that runs past midnight and says so under the length', () => {
      const { submit, set, saved, text } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 12), startTime: '22:30', durationChoice: '120' });

      submit();

      expect(text()).toContain('Việc phải kết thúc trong cùng ngày (không quá 24:00).');
      expect(saved).not.toHaveBeenCalled();
    });

    it('allows a block that ends exactly at midnight', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 12), startTime: '22:00', durationChoice: '120' });

      submit();

      expect(saved).toHaveBeenCalledTimes(1);
    });

    it('rejects a time that is not HH:mm, naming the format', () => {
      const { submit, set, saved, text } = setup();
      set({ title: 'Việc', startDate: new Date(2026, 10, 12), startTime: '99:99' });

      submit();

      expect(text()).toContain('Nhập giờ dạng HH:mm, ví dụ 09:30.');
      expect(saved).not.toHaveBeenCalled();
    });

    it('a time without a day is explained under the day', () => {
      const { submit, set, saved, text } = setup();
      set({ title: 'Việc', startTime: '09:00' });

      submit();

      expect(text()).toContain('Chọn ngày bắt đầu cho giờ đã nhập.');
      expect(saved).not.toHaveBeenCalled();
    });

    it('a custom length must be 1 to 1440 whole minutes', () => {
      const { submit, set, saved, text, fixture } = setup();
      set({ title: 'Việc', durationChoice: 'custom', customMinutes: 0 });
      fixture.detectChanges();

      submit();
      expect(text()).toContain('Thời lượng từ 1 đến 1440 phút.');
      expect(saved).not.toHaveBeenCalled();

      set({ customMinutes: 45 });
      submit();
      expect(saved.mock.calls[0][0].durationMinutes).toBe(45);
    });

    it('a duration needs no start time: it can be an estimate', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Ước lượng', durationChoice: '30' });

      submit();

      expect(saved.mock.calls[0][0]).toMatchObject({ startDate: null, durationMinutes: 30 });
    });

    it('emits the chosen start moment with minutes precision', () => {
      const { submit, set, saved } = setup();
      set({ title: 'Họp', startDate: new Date(2026, 10, 12), startTime: '09:45', durationChoice: '30' });

      submit();

      expect(saved.mock.calls[0][0].startDate).toBe(new Date(2026, 10, 12, 9, 45).toISOString());
    });

    it.each([[15], [60], [240]])('editing a %i minute task selects that quick choice and saves it unchanged', (minutes) => {
      const start = new Date(2026, 10, 12, 9, 0).toISOString();
      const { el, submit, saved } = setup({ task: aTask({ startDate: start, durationMinutes: minutes }) });

      expect(el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toBeTruthy();
      submit();

      expect(saved.mock.calls[0][0]).toMatchObject({ startDate: start, durationMinutes: minutes });
    });

    it('editing a 45 minute task, which has no quick choice, opens "Khác" with 45', () => {
      const { el, form } = setup({ task: aTask({ startDate: new Date(2026, 10, 12, 9, 0).toISOString(), durationMinutes: 45 }) });

      expect(form.getRawValue()).toMatchObject({ durationChoice: 'custom', customMinutes: 45, startTime: '09:00' });
      expect(el.querySelector('label[nz-radio-button].ant-radio-button-wrapper-checked')!.textContent).toContain('Khác');
    });

    it('opens pre-set to a free slot picked on the day calendar, for a new task only', () => {
      const { form, fixture } = setup();

      fixture.componentRef.setInput('prefill', { date: '2026-11-12', time: '14:30' });
      fixture.detectChanges();

      expect(form.getRawValue().startDate).toEqual(new Date(2026, 10, 12));
      expect(form.getRawValue().startTime).toBe('14:30');
    });

    it('ignores a prefill with a malformed date and never overrides the task being edited', () => {
      const bad = setup();
      bad.fixture.componentRef.setInput('prefill', { date: 'tomorrow', time: '14:30' });
      bad.fixture.detectChanges();
      expect(bad.form.getRawValue().startDate).toBeNull();
      expect(bad.form.getRawValue().startTime).toBe('');
      TestBed.resetTestingModule();

      const edit = setup({ task: aTask({ startDate: new Date(2026, 10, 1, 8, 0).toISOString() }) });
      edit.fixture.componentRef.setInput('prefill', { date: '2026-11-12', time: '14:30' });
      edit.fixture.detectChanges();
      expect(edit.form.getRawValue().startTime).toBe('08:00');
    });
  });
});
