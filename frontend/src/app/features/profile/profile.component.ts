import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';

import { User } from '../../core/auth/auth.models';
import { ApiError } from '../../core/http/api-error';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NotifyService } from '../../core/notify/notify.service';
import { applyServerErrors, clearServerErrorOnEdit, firstError, revealAllErrors } from '../../shared/forms/server-errors';
import { notBlankValidator } from '../../shared/forms/validators';
import { ErrorStateComponent } from '../../shared/ui/error-state.component';
import { PasswordRulesComponent } from '../../shared/ui/password-rules.component';
import { PASSWORD_MAX_LENGTH, passwordPolicyValidator } from '../../shared/util/password-rules';
import { ProfileService } from './profile.service';

/** Same normalisation the server applies (AC-01), so "is the email changing?" agrees with it. */
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

@Component({
  selector: 'tf-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NzButtonModule, NzFormModule, NzInputModule, ErrorStateComponent, PasswordRulesComponent, TranslatePipe],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent {
  private readonly profile = inject(ProfileService);
  private readonly notify = inject(NotifyService);
  private readonly i18n = inject(I18nService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal<ApiError | null>(null);
  private readonly saved = signal<User | null>(null);

  protected readonly infoForm = this.fb.group({
    fullName: ['', [Validators.required, notBlankValidator, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    currentPassword: [''],
  });

  protected readonly passwordForm = this.fb.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, passwordPolicyValidator(), Validators.maxLength(PASSWORD_MAX_LENGTH)]],
  });

  protected readonly savingInfo = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly infoError = signal('');
  protected readonly passwordError = signal('');

  private readonly emailValue = toSignal(this.infoForm.controls.email.valueChanges, { initialValue: '' });
  private readonly newPasswordValue = toSignal(this.passwordForm.controls.newPassword.valueChanges, { initialValue: '' });
  protected readonly newPassword = computed(() => this.newPasswordValue() ?? '');

  /** The current password is asked for only when the email is actually changing (AC-06). */
  protected readonly emailChanged = computed(() => {
    const saved = this.saved();
    return saved !== null && normalizeEmail(this.emailValue() ?? '') !== normalizeEmail(saved.email);
  });

  constructor() {
    clearServerErrorOnEdit(this.infoForm);
    clearServerErrorOnEdit(this.passwordForm);
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.profile.get().subscribe({
      next: (user) => {
        this.adopt(user);
        this.state.set('ready');
      },
      error: (error: ApiError) => {
        this.loadError.set(error);
        this.state.set('error');
      },
    });
  }

  protected infoText(name: 'fullName' | 'email' | 'currentPassword'): string {
    const t = this.i18n.t.bind(this.i18n);
    const messages = {
      fullName: { required: t('auth.err.fullNameRequired'), blank: t('auth.err.fullNameRequired'), maxlength: t('auth.err.fullNameMax') },
      email: { required: t('auth.err.emailRequired'), email: t('auth.err.emailInvalid'), maxlength: t('auth.err.emailMax') },
      currentPassword: { required: t('err.currentPwdEmail') },
    } as const;
    return firstError(this.infoForm.controls[name], messages[name]);
  }

  protected passwordText(name: 'currentPassword' | 'newPassword'): string {
    const t = this.i18n.t.bind(this.i18n);
    const messages = {
      currentPassword: { required: t('err.currentPwdRequired') },
      newPassword: { required: t('err.newPwdRequired'), passwordPolicy: t('err.newPwdPolicy'), maxlength: t('auth.err.passwordMax') },
    } as const;
    return firstError(this.passwordForm.controls[name], messages[name]);
  }

  protected saveInfo(): void {
    if (this.savingInfo()) {
      return;
    }
    this.infoError.set('');
    const password = this.infoForm.controls.currentPassword;
    if (this.emailChanged()) {
      password.addValidators(Validators.required);
    } else {
      password.clearValidators();
      password.setValue('', { emitEvent: false });
    }
    password.updateValueAndValidity({ emitEvent: false });

    if (this.infoForm.invalid) {
      revealAllErrors(this.infoForm);
      return;
    }

    const { fullName, email, currentPassword } = this.infoForm.getRawValue();
    this.savingInfo.set(true);
    this.profile
      .update({ fullName: fullName.trim(), email: email.trim(), ...(this.emailChanged() ? { currentPassword } : {}) })
      .subscribe({
        next: (user) => {
          this.savingInfo.set(false);
          this.adopt(user);
          this.notify.success(this.i18n.t('toast.saved'));
        },
        error: (error: ApiError) => {
          this.savingInfo.set(false);
          const unmatched = applyServerErrors(this.infoForm, error);
          this.infoError.set(unmatched[0] ?? (Object.keys(error.fieldErrors).length ? '' : error.message));
        },
      });
  }

  protected savePassword(): void {
    if (this.savingPassword()) {
      return;
    }
    this.passwordError.set('');
    if (this.passwordForm.invalid) {
      revealAllErrors(this.passwordForm);
      return;
    }

    this.savingPassword.set(true);
    this.profile.changePassword(this.passwordForm.getRawValue()).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordForm.reset({ currentPassword: '', newPassword: '' });
        this.notify.success(this.i18n.t('toast.passwordChanged'));
      },
      error: (error: ApiError) => {
        this.savingPassword.set(false);
        const unmatched = applyServerErrors(this.passwordForm, error);
        this.passwordError.set(unmatched[0] ?? (Object.keys(error.fieldErrors).length ? '' : error.message));
      },
    });
  }

  private adopt(user: User): void {
    this.saved.set(user);
    this.infoForm.reset({ fullName: user.fullName, email: user.email, currentPassword: '' });
  }
}
