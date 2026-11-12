import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import vi from '@angular/common/locales/vi';
import { ApplicationConfig, LOCALE_ID, importProvidersFrom, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import {
  ArrowDownOutline, ArrowLeftOutline, ArrowUpOutline, CalendarOutline, CheckCircleFill, CheckOutline, CheckSquareOutline, CloseCircleFill, CloseOutline, DashboardOutline,
  DeleteOutline, DownOutline, EditOutline, EllipsisOutline, ExclamationCircleFill, FilterOutline, InfoCircleFill, LeftOutline, LoadingOutline,
  LogoutOutline, MenuOutline, PlusOutline, ReloadOutline, RightOutline, SearchOutline, UpOutline, UserOutline,
} from '@ant-design/icons-angular/icons';
import { provideNzConfig } from 'ng-zorro-antd/core/config';
import { provideNzI18n, vi_VN } from 'ng-zorro-antd/i18n';
import { provideNzIcons } from 'ng-zorro-antd/icon';
import { NzModalModule } from 'ng-zorro-antd/modal';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { AppTitleStrategy } from './core/i18n/title.strategy';

registerLocaleData(vi);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Order matters: the token is attached first, then errors are normalised on the way back.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Confirms a stored token before the first screen renders, so the header never flashes a signed-out state.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    { provide: LOCALE_ID, useValue: 'vi' },
    provideNzI18n(vi_VN),
    // NzModalService is not providedIn root (unlike NzMessageService); ConfirmService needs it app-wide.
    importProvidersFrom(NzModalModule),
    provideNzConfig({ message: { nzTop: 16, nzMaxStack: 3 } }),
    provideNzIcons([
      ArrowDownOutline, ArrowLeftOutline, ArrowUpOutline, CalendarOutline, CheckCircleFill, CheckOutline, CheckSquareOutline, CloseCircleFill, CloseOutline, DashboardOutline,
      DeleteOutline, DownOutline, EditOutline, EllipsisOutline, ExclamationCircleFill, FilterOutline, InfoCircleFill, LeftOutline, LoadingOutline,
      LogoutOutline, MenuOutline, PlusOutline, ReloadOutline, RightOutline, SearchOutline, UpOutline, UserOutline,
    ]),
  ],
};
