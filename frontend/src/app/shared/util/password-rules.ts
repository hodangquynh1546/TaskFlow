import { Translate, viTranslate } from '../../core/i18n/translate';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'digit';
  label: string;
  met: boolean;
}

/** Mirrors the backend policy (AC-03) so the user sees what is missing while typing; the server still has the final say. */
export function checkPassword(password: string, t: Translate = viTranslate): PasswordRule[] {
  return [
    { id: 'length', label: t('password.length', { n: PASSWORD_MIN_LENGTH }), met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH },
    { id: 'upper', label: t('password.upper'), met: /\p{Lu}/u.test(password) },
    { id: 'lower', label: t('password.lower'), met: /\p{Ll}/u.test(password) },
    { id: 'digit', label: t('password.digit'), met: /[0-9]/.test(password) },
  ];
}

export function passwordPolicyValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '');
    return value.length === 0 || checkPassword(value).every((rule) => rule.met) ? null : { passwordPolicy: true };
  };
}
