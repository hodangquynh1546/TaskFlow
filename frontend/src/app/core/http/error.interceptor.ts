import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { I18nService } from '../i18n/i18n.service';
import { toApiError } from './api-error';
import { HANDLE_UNAUTHORIZED } from './http-context';

/** Everything downstream receives an ApiError; a rejected token additionally ends the session. */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_BASE_URL);
  if (!request.url.startsWith(`${base}/`)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const i18n = inject(I18nService);
  return next(request).pipe(
    catchError((error: unknown) => {
      const apiError = toApiError(error, (key, params) => i18n.t(key, params));
      if (apiError.status === 401 && request.context.get(HANDLE_UNAUTHORIZED)) {
        auth.expireSession();
      }
      return throwError(() => apiError);
    }),
  );
};
