import { MessageKey } from '../../core/i18n/messages/vi';

export interface NavItem {
  labelKey: MessageKey;
  /** Name of an icon registered in app.config.ts. */
  icon: string;
  path: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.dashboard', icon: 'dashboard', path: '/dashboard' },
  { labelKey: 'nav.schedule', icon: 'calendar', path: '/schedule' },
  { labelKey: 'nav.tasks', icon: 'check-square', path: '/tasks' },
  { labelKey: 'nav.profile', icon: 'user', path: '/profile' },
];
