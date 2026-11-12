import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService, MessageParams } from './i18n.service';
import { MessageKey } from './messages/vi';

/** `{{ 'tasks.title' | t }}`. Impure on purpose: it reads the language signal, which a pure pipe would cache past a language switch. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: MessageKey, params?: MessageParams): string {
    return this.i18n.t(key, params);
  }
}
