import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { sanitizeReturnUrl } from '../../../core/auth/return-url';
import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import { applyServerErrors, clearServerErrorOnEdit, firstError, revealAllErrors } from '../../../shared/forms/server-errors';

@Component({
  selector: 'tf-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NzButtonModule, NzFormModule, NzInputModule, TranslatePipe],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  /** Bound from the query string by the router (see withComponentInputBinding). */
  readonly returnUrl = input<string>();
  readonly reason = input<string>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal('');


  constructor() {
    clearServerErrorOnEdit(this.form);
  }

  protected errorText(name: 'email' | 'password'): string {
    const t = (key: Parameters<I18nService['t']>[0]) => this.i18n.t(key);
    return firstError(
      this.form.controls[name],
      name === 'email' ? { required: t('auth.err.emailRequired'), email: t('auth.err.emailInvalid') } : { required: t('auth.err.passwordRequired') },
    );
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
    const { email, password } = this.form.getRawValue();
    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => void this.router.navigateByUrl(sanitizeReturnUrl(this.returnUrl())),
      error: (error: ApiError) => {
        this.submitting.set(false);
        const unmatched = applyServerErrors(this.form, error);
        this.formError.set(unmatched[0] ?? (Object.keys(error.fieldErrors).length ? '' : error.message));
      },
    });
  }
}
