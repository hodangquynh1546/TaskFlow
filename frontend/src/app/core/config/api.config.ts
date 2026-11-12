import { InjectionToken } from '@angular/core';

/**
 * Base path of the backend API. Relative on purpose: in development the dev server proxies /api to the
 * backend (proxy.conf.json) and in production a reverse proxy does the same, so no CORS or absolute URL is involved.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api',
});
