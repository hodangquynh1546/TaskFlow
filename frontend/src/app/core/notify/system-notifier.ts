import { Injectable } from '@angular/core';

export type NotifyPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface SystemNotice {
  title: string;
  body: string;
  /** Notices with the same tag replace each other instead of piling up. */
  tag: string;
  onClick: () => void;
}

/** The browser's notification API, in one small place so everything that uses it can be tested without a real one. */
@Injectable({ providedIn: 'root' })
export class SystemNotifier {
  permission(): NotifyPermission {
    return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  }

  /** Asks the person. Browsers only allow this straight after a click. */
  async request(): Promise<NotifyPermission> {
    if (typeof Notification === 'undefined') {
      return 'unsupported';
    }
    try {
      return await Notification.requestPermission();
    } catch {
      return this.permission();
    }
  }

  show(notice: SystemNotice): void {
    if (this.permission() !== 'granted') {
      return;
    }
    const notification = new Notification(notice.title, { body: notice.body, tag: notice.tag });
    notification.onclick = () => {
      notification.close();
      notice.onClick();
    };
  }
}
