import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { API_BASE_URL } from '../config/api.config';
import { I18nService } from '../i18n/i18n.service';

/**
 * Adds the bearer token and the interface language to calls to our own API only, never to any other origin.
 * The language lets the backend answer its error messages in the language the user is reading.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const base = inject(API_BASE_URL);
  if (!request.url.startsWith(`${base}/`)) {
    return next(request);
  }
  const token = inject(AuthService).accessToken();
  const headers: Record<string, string> = { 'Accept-Language': inject(I18nService).lang() };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return next(request.clone({ setHeaders: headers }));
};
