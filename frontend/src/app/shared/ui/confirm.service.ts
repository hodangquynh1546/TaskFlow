import { Injectable, inject } from '@angular/core';
import { NzModalService } from 'ng-zorro-antd/modal';

import { I18nService } from '../../core/i18n/i18n.service';

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly modal = inject(NzModalService);
  private readonly i18n = inject(I18nService);

  /**
   * Resolves true only if the user confirms. Closing the dialog any other way (Esc, the close button,
   * clicking outside) resolves false. "Keep" is focused first, so an accidental Enter cannot delete.
   */
  confirmDelete(taskTitle: string): Promise<boolean> {
    return this.ask(this.i18n.t('confirm.deleteTitle', { title: taskTitle }), this.i18n.t('confirm.deleteBody'));
  }

  /** The same question for several tasks at once: it names how many, not which. */
  confirmDeleteMany(count: number): Promise<boolean> {
    return this.ask(this.i18n.t('confirm.deleteManyTitle', { count }), this.i18n.t('confirm.deleteManyBody'));
  }

  private ask(title: string, body: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let confirmed = false;
      const ref = this.modal.confirm({
        nzTitle: title,
        nzContent: body,
        nzOkText: this.i18n.t('confirm.deleteOk'),
        nzOkDanger: true,
        nzCancelText: this.i18n.t('confirm.deleteKeep'),
        nzAutofocus: 'cancel',
        nzOnOk: () => {
          confirmed = true;
        },
      });
      ref.afterClose.subscribe(() => resolve(confirmed));
    });
  }
}
