import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { I18nService } from '../i18n/i18n.service';
import { toApiError } from './api-error';
import { HANDLE_UNAUTHORIZED, RENEWAL_TRIED } from './http-context';

/**
 * Everything downstream receives an ApiError. A refused access token first gets one chance to be renewed and the
 * request repeated; only when the refresh token is refused too does the session end.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_BASE_URL);
  if (!request.url.startsWith(`${base}/`)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const i18n = inject(I18nService);
  const asApiError = (error: unknown) => toApiError(error, (key, params) => i18n.t(key, params));

  return next(request).pipe(
    catchError((error: unknown) => {
      const apiError = asApiError(error);
      if (apiError.status !== 401 || !request.context.get(HANDLE_UNAUTHORIZED)) {
        return throwError(() => apiError);
      }

      if (auth.canRenew() && !request.context.get(RENEWAL_TRIED)) {
        return from(auth.renew()).pipe(
          switchMap((outcome) => {
            if (outcome === 'renewed') {
              // Repeats the call straight to the server, so the new token has to be put on it by hand.
              const retry = request.clone({
                context: request.context.set(RENEWAL_TRIED, true),
                setHeaders: { Authorization: `Bearer ${auth.accessToken()}` },
              });
              return next(retry).pipe(catchError((again: unknown) => throwError(() => asApiError(again))));
            }
            if (outcome === 'rejected') {
              auth.expireSession();
            }
            return throwError(() => apiError);
          }),
        );
      }

      auth.expireSession();
      return throwError(() => apiError);
    }),
  );
};
