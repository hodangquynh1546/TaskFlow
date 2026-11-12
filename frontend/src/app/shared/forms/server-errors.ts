import { AbstractControl, FormGroup } from '@angular/forms';

import { ApiError } from '../../core/http/api-error';

/**
 * Puts the server's per-field messages onto the matching form controls (key = control name).
 * Returns the messages that had no matching control so the caller can show them above the form.
 */
export function applyServerErrors(form: FormGroup, error: ApiError): string[] {
  const unmatched: string[] = [];
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    const control = form.get(field);
    if (control) {
      // Mark first: setErrors emits the status change NG-ZORRO redraws from, and it only shows errors on a dirty/touched control.
      control.markAsDirty();
      control.markAsTouched();
      control.setErrors({ ...control.errors, server: messages.join(' ') });
    } else {
      unmatched.push(...messages);
    }
  }
  return unmatched;
}

/** Text for a control's first failing rule, or '' when it is fine. Server messages win over client-side ones. */
export function firstError(control: AbstractControl | null, messages: Readonly<Record<string, string>>): string {
  const errors = control?.errors;
  if (!errors) {
    return '';
  }
  if (typeof errors['server'] === 'string') {
    return errors['server'];
  }
  const key = Object.keys(errors).find((k) => k in messages);
  return key ? messages[key] : '';
}

/**
 * A server error describes the data that was submitted, which can involve several fields (a start date that is
 * after the due date is blamed on one but fixed through either). So editing any field clears every server error;
 * the next submit gets a fresh verdict.
 */
export function clearServerErrorOnEdit(form: FormGroup): void {
  form.valueChanges.subscribe(() => {
    for (const control of Object.values(form.controls)) {
      if (control.errors && 'server' in control.errors) {
        const { server: _removed, ...rest } = control.errors;
        control.setErrors(Object.keys(rest).length ? rest : null);
      }
    }
  });
}

/**
 * Makes every invalid field show its message. markAllAsTouched() alone is not enough: NG-ZORRO's form control only
 * redraws when the control emits a status change, so each control is re-validated after being marked.
 */
export function revealAllErrors(form: FormGroup): void {
  for (const control of Object.values(form.controls)) {
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity({ onlySelf: true });
  }
}
