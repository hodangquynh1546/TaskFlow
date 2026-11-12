import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzFormModule } from 'ng-zorro-antd/form';
import { NzInputModule } from 'ng-zorro-antd/input';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { notBlankValidator } from '../../../shared/forms/validators';
import { applyServerErrors, clearServerErrorOnEdit, firstError, revealAllErrors } from '../../../shared/forms/server-errors';
import { PRIORITY_KEYS, STATUS_KEYS, TASK_PRIORITIES, TASK_STATUSES, Task, TaskPayload } from '../../../shared/models/task.models';
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
import { DURATION_PRESETS, MAX_DURATION_MINUTES, blockEnd, formatClock, formatDuration } from '../../../shared/util/duration';
import { parseDay } from '../task-query';

@Component({
  selector: 'tf-task-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, NzButtonModule, NzDatePickerModule, NzFormModule, NzInputModule, NzInputNumberModule, NzRadioModule, NzSelectModule, TranslatePipe],
  templateUrl: './task-form.component.html',
  styleUrl: './task-form.component.scss',
})
export class TaskFormComponent {
  protected readonly i18n = inject(I18nService);

  /** The task being edited; omit to create a new one with the defaults. */
  readonly task = input<Task | null>(null);
  readonly submitLabel = input.required<string>();
  readonly saving = input(false);
  /** Where a new task starts, when the user came from a free slot on the day calendar ("yyyy-MM-dd" and "HH:mm"). */
  readonly prefill = input<{ date?: string; time?: string } | null>(null);

  readonly save = output<TaskPayload>();
  readonly cancelled = output<void>();

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly priorityKeys = PRIORITY_KEYS;
  protected readonly presets = DURATION_PRESETS;
  protected formatDuration(minutes: number): string {
    return formatDuration(minutes, (k, p) => this.i18n.t(k, p));
  }
  protected readonly maxDuration = MAX_DURATION_MINUTES;

  protected readonly form = inject(FormBuilder).group(
    {
      title: [EMPTY_TASK_FORM.title, [Validators.required, notBlankValidator, Validators.maxLength(200)]],
      description: [EMPTY_TASK_FORM.description, [Validators.maxLength(5000)]],
      priority: [EMPTY_TASK_FORM.priority],
      status: [EMPTY_TASK_FORM.status],
      startDate: [EMPTY_TASK_FORM.startDate as Date | null],
      startTime: [EMPTY_TASK_FORM.startTime, [clockValidator]],
      durationChoice: [EMPTY_TASK_FORM.durationChoice],
      customMinutes: [EMPTY_TASK_FORM.customMinutes as number | null],
      dueDate: [EMPTY_TASK_FORM.dueDate as Date | null],
    },
    { validators: scheduleValidator(() => this.task()?.dueDate ?? null) },
  );

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly customChosen = computed(() => this.formValue().durationChoice === 'custom');

  /** "Kết thúc lúc 10:30": the end of the block the form currently describes, or nothing while it is incomplete. */
  protected readonly endHint = computed(() => {
    // Read the signal first and unconditionally: a computed only tracks what it actually reads, so reading it after
    // an early return would leave this hint frozen at its first value.
    this.formValue();
    const value = this.form.getRawValue() as TaskFormValue;
    const start = resolveStart(value);
    const minutes = resolveDuration(value);
    if (!start || minutes === null || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
      return '';
    }
    return this.i18n.t('form.endsAt', { time: formatClock(blockEnd(start, minutes)) });
  });

  protected readonly formError = signal('');

  constructor() {
    clearServerErrorOnEdit(this.form);

    // Load the task being edited. Runs when the input arrives, never on keystrokes.
    effect(() => {
      const task = this.task();
      const prefill = this.prefill();
      const start = !task && prefill?.date && /^\d{4}-\d{2}-\d{2}$/.test(prefill.date) ? parseDay(prefill.date) : null;
      this.form.reset(
        task ? taskToFormValue(task) : { ...EMPTY_TASK_FORM, startDate: start, startTime: start ? (prefill?.time ?? '') : '' },
      );
    });
  }

  /**
   * In a date picker, Enter means "accept the date I typed". It must not also submit the form: the form would be sent
   * before the picker has committed the text, silently dropping the date. Enter elsewhere still submits as usual.
   */
  protected keepPickerEnterFromSubmitting(event: Event): void {
    if ((event.target as HTMLElement).closest('.ant-picker')) {
      event.preventDefault();
    }
  }

  protected errorText(name: 'title' | 'description' | 'startDate' | 'startTime' | 'customMinutes' | 'dueDate'): string {
    const control = this.form.controls[name];
    const t = this.i18n.t.bind(this.i18n);
    const messages = {
      title: { required: t('err.titleRequired'), blank: t('err.titleRequired'), maxlength: t('err.titleMax') },
      description: { maxlength: t('err.descMax') },
      startDate: {},
      startTime: { invalidTime: t('err.timeFormat') },
      customMinutes: {},
      dueDate: {},
    } as const;
    const own = firstError(control, messages[name]);
    if (own) {
      return own;
    }
    // Rules that span several fields belong to the group but are shown under the field the user can fix.
    const group = this.form;
    if (name === 'startDate' && group.hasError('timeWithoutDate')) {
      return t('err.timeNeedsDate');
    }
    if (name === 'customMinutes' && group.hasError('customDuration') && (control.dirty || control.touched)) {
      return t('err.customMinutes', { max: MAX_DURATION_MINUTES });
    }
    if (name === 'dueDate' && group.hasError('dateOrder')) {
      return t('err.dueBeforeStart');
    }
    return '';
  }

  protected startInvalid(): boolean {
    return this.form.hasError('timeWithoutDate');
  }

  protected customInvalid(): boolean {
    const control = this.form.controls.customMinutes;
    return this.form.hasError('customDuration') && (control.dirty || control.touched);
  }

  /** Shown under the length choice: the block must stay inside one day. */
  protected durationError(): string {
    return this.form.hasError('crossesMidnight') ? this.i18n.t('err.sameDay') : '';
  }

  protected submit(): void {
    this.formError.set('');
    if (this.form.invalid) {
      revealAllErrors(this.form);
      return;
    }
    this.save.emit(formValueToPayload(this.form.getRawValue() as Parameters<typeof formValueToPayload>[0], this.task()));
  }

  /** Called by the page when the server rejects the request: field messages go on the fields, the rest above the form. */
  showServerError(error: ApiError): void {
    const unmatched = applyServerErrors(this.form, error);
    this.formError.set(unmatched[0] ?? (Object.keys(error.fieldErrors).length ? '' : error.message));
  }
}
