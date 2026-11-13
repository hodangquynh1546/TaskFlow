import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';

const NOW = new Date('2026-11-12T10:00:00Z');

function setup(session?: { accessToken: string; expiresAt: string; refreshToken?: string }) {
  localStorage.clear();
  if (session) {
    localStorage.setItem('taskflow.session', JSON.stringify(session));
  }
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  return TestBed.inject(Router);
}

const run = (guard: typeof authGuard, url = '/tasks') =>
  TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));

describe('guards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  describe('authGuard', () => {
    it('lets a signed-in user through', () => {
      setup({ accessToken: 't', expiresAt: '2026-11-12T11:00:00Z' });

      expect(run(authGuard)).toBe(true);
    });

    it('lets a user through whose access token has expired but whose device can renew it', () => {
      setup({ accessToken: 't', expiresAt: '2026-11-12T09:00:00Z', refreshToken: 'r' });

      expect(run(authGuard)).toBe(true);
    });

    it('sends a user with an expired token and no refresh token to login', () => {
      const router = setup({ accessToken: 't', expiresAt: '2026-11-12T09:00:00Z' });

      expect(router.serializeUrl(run(authGuard) as UrlTree)).toContain('/login');
    });

    it('sends a visitor to login and remembers where they were going', () => {
      const router = setup();

      const result = run(authGuard, '/tasks/42?tab=notes') as UrlTree;

      expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Ftasks%2F42%3Ftab%3Dnotes');
    });

    it.each([['/'], ['/dashboard']])('does not add returnUrl for the default landing page %s', (url) => {
      const router = setup();

      expect(router.serializeUrl(run(authGuard, url) as UrlTree)).toBe('/login');
    });

    it('treats an expired token as signed out and removes it', () => {
      const router = setup({ accessToken: 't', expiresAt: '2026-11-12T09:00:00Z' });

      const result = run(authGuard) as UrlTree;

      expect(router.serializeUrl(result)).toContain('/login');
      expect(localStorage.getItem('taskflow.session')).toBeNull();
    });
  });

  describe('guestGuard', () => {
    it('lets a visitor see the login page', () => {
      setup();

      expect(run(guestGuard, '/login')).toBe(true);
    });

    it('sends a signed-in user home instead of showing login again', () => {
      const router = setup({ accessToken: 't', expiresAt: '2026-11-12T11:00:00Z' });

      expect(router.serializeUrl(run(guestGuard, '/login') as UrlTree)).toBe('/');
    });

    it('lets someone with an expired token reach the login page', () => {
      setup({ accessToken: 't', expiresAt: '2026-11-12T09:00:00Z' });

      expect(run(guestGuard, '/login')).toBe(true);
    });
  });
});
