import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

import { I18nService } from './i18n.service';
import { MessageKey } from './messages/vi';

/** Route titles are message keys (`data.titleKey`) so the browser tab follows the language, including after a switch. */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly i18n = inject(I18nService);
  private currentKey: MessageKey | null = null;

  constructor() {
    super();
    effect(() => {
      this.i18n.lang();
      this.apply();
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let node = snapshot.root;
    let key: MessageKey | null = null;
    while (node) {
      key = (node.data['titleKey'] as MessageKey | undefined) ?? key;
      node = node.firstChild as typeof node;
    }
    this.currentKey = key;
    this.apply();
  }

  private apply(): void {
    const page = this.currentKey ? this.i18n.t(this.currentKey) : '';
    this.title.setTitle(page ? `${page} · TaskFlow` : 'TaskFlow');
  }
}
