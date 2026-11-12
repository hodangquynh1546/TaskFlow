import { FormControl, FormGroup, Validators } from '@angular/forms';

import { ApiError } from '../../core/http/api-error';
import { applyServerErrors, clearServerErrorOnEdit, firstError, revealAllErrors } from './server-errors';

const makeForm = () => new FormGroup({ email: new FormControl('a@b.co', Validators.required), title: new FormControl('x') });

describe('applyServerErrors', () => {
  it('puts each field message on its control and marks it so the error shows', () => {
    const form = makeForm();

    const unmatched = applyServerErrors(form, new ApiError(409, 'trùng', { email: ['Email này đã được sử dụng.'] }));

    expect(unmatched).toEqual([]);
    expect(form.controls.email.errors).toEqual({ server: 'Email này đã được sử dụng.' });
    expect(form.controls.email.touched).toBe(true);
    expect(form.controls.email.dirty).toBe(true);
    expect(form.controls.title.errors).toBeNull();
  });

  it('marks the control dirty and touched before announcing the error, so an untouched field still shows it', () => {
    const form = makeForm();
    const seen: boolean[] = [];
    form.controls.title.statusChanges.subscribe(() => seen.push(form.controls.title.dirty && form.controls.title.touched));

    applyServerErrors(form, new ApiError(400, 'x', { title: ['Sai.'] }));

    expect(seen).toEqual([true]);
  });

  it('joins several messages for one field', () => {
    const form = makeForm();

    applyServerErrors(form, new ApiError(400, 'x', { email: ['Một.', 'Hai.'] }));

    expect(form.controls.email.errors).toEqual({ server: 'Một. Hai.' });
  });

  it('returns messages for fields that have no control so they can be shown above the form', () => {
    const form = makeForm();

    const unmatched = applyServerErrors(form, new ApiError(400, 'x', { body: ['Nội dung yêu cầu không hợp lệ.'], email: ['Sai.'] }));

    expect(unmatched).toEqual(['Nội dung yêu cầu không hợp lệ.']);
  });

  it('keeps existing client-side errors alongside the server one', () => {
    const form = makeForm();
    form.controls.email.setValue('');

    applyServerErrors(form, new ApiError(400, 'x', { email: ['Sai.'] }));

    expect(form.controls.email.errors).toEqual({ required: true, server: 'Sai.' });
  });
});

describe('firstError', () => {
  const messages = { required: 'Bắt buộc.', email: 'Sai định dạng.' };

  it('is empty for a valid or missing control', () => {
    expect(firstError(new FormControl('ok', Validators.required), messages)).toBe('');
    expect(firstError(null, messages)).toBe('');
  });

  it('maps the first known failing rule to its message', () => {
    expect(firstError(new FormControl('', Validators.required), messages)).toBe('Bắt buộc.');
    expect(firstError(new FormControl('abc', Validators.email), messages)).toBe('Sai định dạng.');
  });

  it('prefers the server message over client-side ones', () => {
    const control = new FormControl('', Validators.required);
    control.setErrors({ required: true, server: 'Từ máy chủ.' });

    expect(firstError(control, messages)).toBe('Từ máy chủ.');
  });

  it('ignores rules it has no message for', () => {
    const control = new FormControl('abc', Validators.minLength(10));

    expect(firstError(control, messages)).toBe('');
  });
});

describe('clearServerErrorOnEdit', () => {
  it('removes the server error as soon as the user edits the field, keeping other errors', () => {
    const form = makeForm();
    clearServerErrorOnEdit(form);
    applyServerErrors(form, new ApiError(409, 'x', { email: ['Trùng.'] }));
    expect(form.controls.email.errors).toEqual({ server: 'Trùng.' });

    form.controls.email.setValue('khac@b.co');

    expect(form.controls.email.errors).toBeNull();
  });

  it('editing any one field clears the server errors on all fields, because they describe the whole submission', () => {
    const form = makeForm();
    clearServerErrorOnEdit(form);
    applyServerErrors(form, new ApiError(400, 'x', { email: ['A.'], title: ['B.'] }));

    form.controls.email.setValue('y@b.co');

    expect(form.controls.title.errors).toBeNull();
    expect(form.controls.email.errors).toBeNull();
  });

  it('keeps the client-side rules a field still breaks', () => {
    const form = makeForm();
    clearServerErrorOnEdit(form);
    form.controls.email.setValue('');
    applyServerErrors(form, new ApiError(400, 'x', { email: ['A.'] }));

    form.controls.title.setValue('đổi');

    expect(form.controls.email.errors).toEqual({ required: true });
  });
});

describe('revealAllErrors', () => {
  it('marks every control and re-validates it so each one emits a status change', () => {
    const form = new FormGroup({ a: new FormControl('', Validators.required), b: new FormControl('', Validators.required) });
    const changes = vi.fn();
    form.controls.a.statusChanges.subscribe(changes);
    form.controls.b.statusChanges.subscribe(changes);

    revealAllErrors(form);

    expect(form.controls.a.touched && form.controls.a.dirty && form.controls.b.touched && form.controls.b.dirty).toBe(true);
    expect(changes).toHaveBeenCalledTimes(2);
  });
});
