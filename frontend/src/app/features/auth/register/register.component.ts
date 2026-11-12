import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import { applyServerErrors, clearServerErrorOnEdit, firstError, revealAllErrors } from '../../../shared/forms/server-errors';
import { notBlankValidator } from '../../../shared/forms/validators';
import { PasswordRulesComponent } from '../../../shared/ui/password-rules.component';
import { PASSWORD_MAX_LENGTH, passwordPolicyValidator } from '../../../shared/util/password-rules';

@Component({
  selector: 'tf-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NzButtonModule, NzFormModule, NzInputModule, PasswordRulesComponent, TranslatePipe],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    fullName: ['', [Validators.required, notBlankValidator, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.required, passwordPolicyValidator(), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal('');
  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly password = computed(() => this.passwordValue() ?? '');

  constructor() {
    clearServerErrorOnEdit(this.form);
  }

  protected errorText(name: 'fullName' | 'email' | 'password'): string {
    const t = this.i18n.t.bind(this.i18n);
    const messages = {
      fullName: { required: t('auth.err.fullNameRequired'), blank: t('auth.err.fullNameRequired'), maxlength: t('auth.err.fullNameMax') },
      email: { required: t('auth.err.emailRequired'), email: t('auth.err.emailInvalid'), maxlength: t('auth.err.emailMax') },
      password: { required: t('auth.err.passwordRequired'), passwordPolicy: t('auth.err.passwordPolicy'), maxlength: t('auth.err.passwordMax') },
    } as const;
    return firstError(this.form.controls[name], messages[name]);
  }

  protected submit(): void {
    if (this.submitting()) {
      return;
    }
    this.formError.set('');
    if (this.form.invalid) {
      revealAllErrors(this.form);
      return;
    }

    this.submitting.set(true);
    const { fullName, email, password } = this.form.getRawValue();
    this.auth.register({ fullName: fullName.trim(), email: email.trim(), password }).subscribe({
      next: () => void this.router.navigateByUrl('/'),
      error: (error: ApiError) => {
        this.submitting.set(false);
        const unmatched = applyServerErrors(this.form, error);
        this.formError.set(unmatched[0] ?? (Object.keys(error.fieldErrors).length ? '' : error.message));
      },
    });
  }
}
