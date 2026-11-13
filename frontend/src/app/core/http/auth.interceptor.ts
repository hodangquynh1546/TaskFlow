import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { I18nService } from '../i18n/i18n.service';
import { HANDLE_UNAUTHORIZED } from './http-context';

/**
 * Adds the bearer token and the interface language to calls to our own API only, never to any other origin.
 * The language lets the backend answer its error messages in the language the user is reading.
 * When the access token has expired but the device can still renew it, it is renewed first, so the user never notices.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_BASE_URL);
  if (!request.url.startsWith(`${base}/`)) {
    return next(request);
  }
  const auth = inject(AuthService);
  const language = inject(I18nService).lang();

  const send = () => {
    const token = auth.accessToken();
    const headers: Record<string, string> = { 'Accept-Language': language };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return next(request.clone({ setHeaders: headers }));
  };

  // Sign-in, sign-up, refresh and sign-out calls opt out of session handling and must never wait on a renewal.
  const needsRenewal = request.context.get(HANDLE_UNAUTHORIZED) && auth.accessToken() === null && auth.canRenew();
  return needsRenewal ? from(auth.renew()).pipe(switchMap(send)) : send();
};
