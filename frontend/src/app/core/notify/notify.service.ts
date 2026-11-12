import { Injectable, inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';

/** One place for toasts, so wording and timing stay consistent: the action's verb matches the button that caused it. */
@Injectable({ providedIn: 'root' })
export class NotifyService {
  private readonly message = inject(NzMessageService);

  success(text: string): void {
    this.message.success(text, { nzDuration: 3000 });
  }

  error(text: string): void {
    this.message.error(text, { nzDuration: 6000 });
  }

  info(text: string): void {
    this.message.info(text, { nzDuration: 4000 });
  }
}
