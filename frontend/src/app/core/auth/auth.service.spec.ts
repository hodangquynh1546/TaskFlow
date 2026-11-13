import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthResponse, User } from './auth.models';
import { AuthService } from './auth.service';
import { StoredSession } from './token-store';

const NOW = new Date('2026-11-12T10:00:00Z');
const USER: User = { id: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() };
const FUTURE = '2026-11-12T11:00:00Z';
const PAST = '2026-11-12T09:59:59Z';
const response = (expiresAt = FUTURE): AuthResponse => ({ accessToken: 'tok-1', expiresAt, refreshToken: 'ref-1', user: USER });

function setup(stored?: StoredSession) {
  localStorage.clear();
  if (stored) {
    localStorage.setItem('taskflow.session', JSON.stringify(stored));
  }
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController), navigate, router };
}

describe('AuthService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('login and register', () => {
    it('login stores the session, exposes the user and returns it', () => {
      const { auth, http } = setup();
      let result: User | undefined;

      auth.login({ email: 'a@example.com', password: 'Passw0rd1' }).subscribe((u) => (result = u));
      const req = http.expectOne('/api/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'a@example.com', password: 'Passw0rd1' });
      req.flush(response());

      expect(result).toEqual(USER);
      expect(auth.user()).toEqual(USER);
      expect(auth.hasValidSession()).toBe(true);
      expect(auth.accessToken()).toBe('tok-1');
      expect(auth.isSignedIn()).toBe(true);
      expect(JSON.parse(localStorage.getItem('taskflow.session')!)).toEqual({ accessToken: 'tok-1', expiresAt: FUTURE, refreshToken: 'ref-1' });
    });

    it('a failed login leaves the user signed out and stores nothing', () => {
      const { auth, http } = setup();
      let failed = false;

      auth.login({ email: 'a@example.com', password: 'x' }).subscribe({ error: () => (failed = true) });
      http.expectOne('/api/auth/login').flush({ detail: 'no' }, { status: 401, statusText: 'Unauthorized' });

      expect(failed).toBe(true);
      expect(auth.hasValidSession()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(localStorage.getItem('taskflow.session')).toBeNull();
    });

    it('register signs the new user in straight away', () => {
      const { auth, http } = setup();

      auth.register({ fullName: 'Nguyễn Văn A', email: 'a@example.com', password: 'Passw0rd1' }).subscribe();
      const req = http.expectOne('/api/auth/register');
      expect(req.request.body).toEqual({ fullName: 'Nguyễn Văn A', email: 'a@example.com', password: 'Passw0rd1' });
      req.flush(response());

      expect(auth.hasValidSession()).toBe(true);
      expect(auth.user()).toEqual(USER);
    });
  });

  describe('session validity', () => {
    it('is valid until the expiry instant and not after', () => {
      const { auth } = setup({ accessToken: 't', expiresAt: FUTURE });
      expect(auth.hasValidSession()).toBe(true);

      vi.setSystemTime(new Date(FUTURE));
      expect(auth.hasValidSession()).toBe(false);
      expect(auth.accessToken()).toBeNull();
    });

    it('treats an already expired stored session as signed out', () => {
      const { auth } = setup({ accessToken: 't', expiresAt: PAST });

      expect(auth.hasValidSession()).toBe(false);
      expect(auth.accessToken()).toBeNull();
    });

    it('is signed out when nothing is stored', () => {
      expect(setup().auth.hasValidSession()).toBe(false);
    });
  });

  describe('restoreSession', () => {
    it('loads the user when the stored token is accepted', async () => {
      const { auth, http } = setup({ accessToken: 't', expiresAt: FUTURE });

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/me').flush(USER);
      await pending;

      expect(auth.user()).toEqual(USER);
      expect(auth.hasValidSession()).toBe(true);
    });

    it('ends the session quietly when the server rejects the token', async () => {
      const { auth, http, navigate } = setup({ accessToken: 't', expiresAt: FUTURE });

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
      await pending;

      expect(auth.hasValidSession()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(localStorage.getItem('taskflow.session')).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it.each([[0], [500], [503]])('keeps the session when the check fails with status %i (the user may just be offline)', async (status) => {
      const { auth, http } = setup({ accessToken: 't', expiresAt: FUTURE });

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/me').flush({}, { status, statusText: 'x' });
      await pending;

      expect(auth.hasValidSession()).toBe(true);
      expect(auth.user()).toBeNull();
    });

    it('makes no request when the stored session has expired', async () => {
      const { auth, http } = setup({ accessToken: 't', expiresAt: PAST });

      await auth.restoreSession();

      http.expectNone('/api/auth/me');
      expect(localStorage.getItem('taskflow.session')).toBeNull();
    });

    it('makes no request when there is no session', async () => {
      const { auth, http } = setup();

      await auth.restoreSession();

      http.expectNone('/api/auth/me');
    });
  });

  describe('staying signed in', () => {
    const expired = { accessToken: 'old', expiresAt: PAST, refreshToken: 'ref-old' };
    const rotated = { accessToken: 'tok-2', expiresAt: FUTURE, refreshToken: 'ref-2', user: USER };

    it('reopening the app with an expired access token renews it instead of signing out', async () => {
      const { auth, http } = setup(expired);

      const pending = auth.restoreSession();
      const refresh = http.expectOne('/api/auth/refresh');
      expect(refresh.request.body).toEqual({ refreshToken: 'ref-old' });
      refresh.flush(rotated);
      await vi.waitFor(() => http.expectOne('/api/auth/me').flush(USER));
      await pending;

      expect(auth.hasValidSession()).toBe(true);
      expect(auth.accessToken()).toBe('tok-2');
      expect(auth.user()).toEqual(USER);
      expect(JSON.parse(localStorage.getItem('taskflow.session')!)).toEqual({ accessToken: 'tok-2', expiresAt: FUTURE, refreshToken: 'ref-2' });
    });

    it('an access token refused at startup is replaced using the refresh token instead of ending the session', async () => {
      const { auth, http } = setup({ accessToken: 'revoked', expiresAt: FUTURE, refreshToken: 'ref-old' });

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
      await vi.waitFor(() => http.expectOne('/api/auth/refresh').flush(rotated));
      await vi.waitFor(() => http.expectOne('/api/auth/me').flush(USER));
      await pending;

      expect(auth.user()).toEqual(USER);
      expect(auth.accessToken()).toBe('tok-2');
    });

    it('but when the refresh token is refused as well, that is the end', async () => {
      const { auth, http } = setup({ accessToken: 'revoked', expiresAt: FUTURE, refreshToken: 'ref-old' });

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
      await vi.waitFor(() => http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' }));
      await pending;

      expect(auth.isSignedIn()).toBe(false);
      expect(localStorage.getItem('taskflow.session')).toBeNull();
    });

    it('a refresh token the server refuses ends the session', async () => {
      const { auth, http } = setup(expired);

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
      await pending;

      expect(auth.isSignedIn()).toBe(false);
      expect(localStorage.getItem('taskflow.session')).toBeNull();
      http.expectNone('/api/auth/me');
    });

    it.each([[0], [500], [503]])('being unable to ask (status %i) does not sign the user out', async (status) => {
      const { auth, http } = setup(expired);

      const pending = auth.restoreSession();
      http.expectOne('/api/auth/refresh').flush({}, { status, statusText: 'x' });
      await pending;

      expect(auth.canRenew()).toBe(true);
      expect(localStorage.getItem('taskflow.session')).not.toBeNull();
    });

    it('callers asking at the same moment share one refresh, because the token works only once', async () => {
      const { auth, http } = setup(expired);

      const results = Promise.all([auth.renew(), auth.renew(), auth.renew()]);
      http.expectOne('/api/auth/refresh').flush(rotated);

      expect(await results).toEqual(['renewed', 'renewed', 'renewed']);
    });

    it('uses the newest refresh token in storage, in case another tab already rotated it', async () => {
      const { auth, http } = setup(expired);
      localStorage.setItem('taskflow.session', JSON.stringify({ ...expired, refreshToken: 'ref-from-other-tab' }));

      const pending = auth.renew();

      const request = http.expectOne('/api/auth/refresh');
      expect(request.request.body).toEqual({ refreshToken: 'ref-from-other-tab' });
      request.flush(rotated);
      await pending;
    });

    it('a session saved before refresh tokens existed cannot be renewed and just expires', async () => {
      const { auth, http } = setup({ accessToken: 'old', expiresAt: PAST });

      await auth.restoreSession();

      expect(auth.canRenew()).toBe(false);
      http.expectNone('/api/auth/refresh');
    });
  });

  describe('signOut', () => {
    it('clears everything and goes to the login page without waiting for the server', () => {
      const { auth, http, navigate } = setup({ accessToken: 't', expiresAt: FUTURE });

      auth.signOut();

      expect(auth.hasValidSession()).toBe(false);
      expect(auth.user()).toBeNull();
      expect(localStorage.getItem('taskflow.session')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
      expect(http.expectOne('/api/auth/logout').request.method).toBe('POST');
    });

    it('tells the server which refresh token to end', () => {
      const { auth, http } = setup({ accessToken: 't', expiresAt: FUTURE, refreshToken: 'ref-9' });

      auth.signOut();

      expect(http.expectOne('/api/auth/logout').request.body).toEqual({ refreshToken: 'ref-9' });
    });

    it('is unaffected by the server call failing', () => {
      const { auth, http } = setup({ accessToken: 't', expiresAt: FUTURE });

      auth.signOut();
      http.expectOne('/api/auth/logout').flush({}, { status: 500, statusText: 'x' });

      expect(auth.hasValidSession()).toBe(false);
    });
  });

  describe('expireSession', () => {
    it('drops the session and sends the user to login with a reason and where they were', () => {
      const { auth, router, navigate } = setup({ accessToken: 't', expiresAt: FUTURE });
      vi.spyOn(router, 'url', 'get').mockReturnValue('/tasks?page=2');

      auth.expireSession();

      expect(auth.hasValidSession()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired', returnUrl: '/tasks?page=2' } });
    });

    it('omits returnUrl when the user was on the home page', () => {
      const { auth, router, navigate } = setup({ accessToken: 't', expiresAt: FUTURE });
      vi.spyOn(router, 'url', 'get').mockReturnValue('/');

      auth.expireSession();

      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired' } });
    });

    it('does nothing when already signed out, so several failing requests navigate only once', () => {
      const { auth, navigate } = setup({ accessToken: 't', expiresAt: FUTURE });

      auth.expireSession();
      auth.expireSession();
      auth.expireSession();

      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });
});
