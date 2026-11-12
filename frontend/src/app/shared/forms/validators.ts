import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Angular's `Validators.required` accepts "   ". Text that is only whitespace is still empty to a person, and the
 * server trims it to nothing, so it must be caught on the client too.
 */
export function notBlankValidator(control: AbstractControl): ValidationErrors | null {
  return typeof control.value === 'string' && control.value.length > 0 && control.value.trim().length === 0 ? { blank: true } : null;
}
