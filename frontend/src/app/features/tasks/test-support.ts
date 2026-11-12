import { registerLocaleData } from '@angular/common';
import vi_locale from '@angular/common/locales/vi';
import { EnvironmentProviders, LOCALE_ID, Provider } from '@angular/core';
import { provideNzI18n, vi_VN } from 'ng-zorro-antd/i18n';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';

import { Task } from '../../shared/models/task.models';

registerLocaleData(vi_locale);

/** What the real app config provides for NG-ZORRO and Angular, so components render in tests as they do in the app. */
export const UI_TEST_PROVIDERS: (Provider | EnvironmentProviders)[] = [provideNzIconsTesting(), provideNzI18n(vi_VN), { provide: LOCALE_ID, useValue: 'vi' }];

export const aTask = (patch: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Viết báo cáo', description: 'Báo cáo quý 4', status: 'Todo', priority: 'Medium', startDate: null, dueDate: null, durationMinutes: null,
  isOverdue: false, createdAt: '2026-11-01T08:00:00Z', updatedAt: '2026-11-02T09:30:00Z', ...patch,
});
