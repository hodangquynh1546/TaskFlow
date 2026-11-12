import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Where signed-in users land by default; there is nothing to "return" to, so the login URL stays clean. */
const DEFAULT_LANDING: readonly string[] = ['/', '/dashboard'];

/** Keeps signed-out visitors out of the app and remembers where they were going. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.hasValidSession()) {
    return true;
  }
  auth.clearSession();
  const returnUrl = DEFAULT_LANDING.includes(state.url) ? {} : { returnUrl: state.url };
  return inject(Router).createUrlTree(['/login'], { queryParams: returnUrl });
};

/** Pages for signed-out visitors (login, register); signed-in users are sent home instead. */
export const guestGuard: CanActivateFn = () => {
  return inject(AuthService).hasValidSession() ? inject(Router).createUrlTree(['/']) : true;
};
