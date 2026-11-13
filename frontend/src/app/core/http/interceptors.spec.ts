import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { I18nService } from '../i18n/i18n.service';
import { ApiError } from './api-error';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { HANDLE_UNAUTHORIZED } from './http-context';

const NOW = new Date('2026-11-12T10:00:00Z');
const SESSION = { accessToken: 'secret-token', expiresAt: '2026-11-12T11:00:00Z' };
const RENEWABLE = { accessToken: 'old-token', expiresAt: '2026-11-12T09:00:00Z', refreshToken: 'ref-1' };
const NEW_TOKENS = { accessToken: 'new-token', expiresAt: '2026-11-12T11:00:00Z', refreshToken: 'ref-2', user: { id: 'u', fullName: 'A', email: 'a@x.com', createdAt: '', updatedAt: '' } };

function setup(session?: typeof SESSION | typeof RENEWABLE | { accessToken: string; expiresAt: string; refreshToken?: string }) {
  localStorage.clear();
  if (session) {
    localStorage.setItem('taskflow.session', JSON.stringify(session));
  }
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  vi.spyOn(router, 'url', 'get').mockReturnValue('/tasks');
  return { http: TestBed.inject(HttpClient), mock: TestBed.inject(HttpTestingController), auth: TestBed.inject(AuthService), navigate };
}

describe('HTTP interceptors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('authInterceptor', () => {
    it('adds the bearer token to calls to our API', () => {
      const { http, mock } = setup(SESSION);

      http.get('/api/tasks').subscribe();

      expect(mock.expectOne('/api/tasks').request.headers.get('Authorization')).toBe('Bearer secret-token');
    });

    it('tells the backend which language the interface is in, so its error messages match', () => {
      const { http, mock } = setup(SESSION);

      http.get('/api/tasks').subscribe();
      expect(mock.expectOne('/api/tasks').request.headers.get('Accept-Language')).toBe('vi');

      TestBed.inject(I18nService).setLang('en');
      http.get('/api/tasks').subscribe();
      expect(mock.expectOne('/api/tasks').request.headers.get('Accept-Language')).toBe('en');
      TestBed.inject(I18nService).setLang('vi');
    });

    it('sends the language even when signed out (login and register errors need it most)', () => {
      const { http, mock } = setup();

      http.post('/api/auth/login', {}).subscribe({ error: () => undefined });

      const request = mock.expectOne('/api/auth/login').request;
      expect(request.headers.get('Accept-Language')).toBe('vi');
      expect(request.headers.has('Authorization')).toBe(false);
    });

    it('never sends the token or the language to another origin', () => {
      const { http, mock } = setup(SESSION);

      http.get('https://example.com/api/tasks').subscribe();
      http.get('https://evil.example/steal').subscribe();

      expect(mock.expectOne('https://example.com/api/tasks').request.headers.has('Authorization')).toBe(false);
      expect(mock.expectOne('https://evil.example/steal').request.headers.has('Authorization')).toBe(false);
    });

    it('does not treat a lookalike path as our API', () => {
      const { http, mock } = setup(SESSION);

      http.get('/apiary/x').subscribe();

      expect(mock.expectOne('/apiary/x').request.headers.has('Authorization')).toBe(false);
    });

    it('sends no header when signed out or when the token has expired', () => {
      const signedOut = setup();
      signedOut.http.get('/api/tasks').subscribe();
      expect(signedOut.mock.expectOne('/api/tasks').request.headers.has('Authorization')).toBe(false);

      TestBed.resetTestingModule();
      const expired = setup({ accessToken: 'old', expiresAt: '2026-11-12T09:00:00Z' });
      expired.http.get('/api/tasks').subscribe();
      expect(expired.mock.expectOne('/api/tasks').request.headers.has('Authorization')).toBe(false);
    });

    it('the best-effort logout request still carries the token', () => {
      const { auth, mock } = setup(SESSION);

      auth.signOut();

      expect(mock.expectOne('/api/auth/logout').request.headers.get('Authorization')).toBe('Bearer secret-token');
    });
  });

  describe('staying signed in', () => {
    const live = { accessToken: 'secret-token', expiresAt: '2026-11-12T11:00:00Z', refreshToken: 'ref-1' };

    it('renews an expired access token first, then sends the call with the new one', () => {
      const { http, mock } = setup(RENEWABLE);
      let body: unknown;

      http.get('/api/tasks').subscribe((b) => (body = b));
      mock.expectNone('/api/tasks');
      mock.expectOne('/api/auth/refresh').flush(NEW_TOKENS);
      return vi.waitFor(() => {
        const call = mock.expectOne('/api/tasks');
        expect(call.request.headers.get('Authorization')).toBe('Bearer new-token');
        call.flush({ ok: true });
        expect(body).toEqual({ ok: true });
      });
    });

    it('a refused token is renewed and the call repeated once, invisibly to the caller', () => {
      const { http, mock, navigate } = setup(live);
      let body: unknown;

      http.get('/api/tasks').subscribe((b) => (body = b));
      mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/auth/refresh').flush(NEW_TOKENS);
      return vi.waitFor(() => {
        const again = mock.expectOne('/api/tasks');
        expect(again.request.headers.get('Authorization')).toBe('Bearer new-token');
        again.flush({ ok: 1 });
        expect(body).toEqual({ ok: 1 });
        expect(navigate).not.toHaveBeenCalled();
      });
    });

    it('several calls refused together trigger one refresh', () => {
      const { http, mock } = setup(live);

      for (const path of ['/api/a', '/api/b', '/api/c']) {
        http.get(path).subscribe({ error: () => undefined });
      }
      for (const path of ['/api/a', '/api/b', '/api/c']) {
        mock.expectOne(path).flush({}, { status: 401, statusText: 'Unauthorized' });
      }

      mock.expectOne('/api/auth/refresh').flush(NEW_TOKENS);
    });

    it('if the repeated call is refused as well the user gets that error and nothing loops', () => {
      const { http, mock } = setup(live);
      let error: unknown;

      http.get('/api/tasks').subscribe({ error: (e) => (error = e) });
      mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/auth/refresh').flush(NEW_TOKENS);
      return vi.waitFor(() => {
        mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });
        expect(error).toBeInstanceOf(ApiError);
        mock.expectNone('/api/auth/refresh');
      });
    });

    it('when the refresh token is refused too, the session ends and the user goes to login', () => {
      const { http, mock, navigate, auth } = setup(live);

      http.get('/api/tasks').subscribe({ error: () => undefined });
      mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

      return vi.waitFor(() => {
        expect(auth.isSignedIn()).toBe(false);
        expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired', returnUrl: '/tasks' } });
      });
    });

    it('being unable to reach the server for the refresh does not sign the user out', () => {
      const { http, mock, navigate, auth } = setup(live);
      let error: unknown;

      http.get('/api/tasks').subscribe({ error: (e) => (error = e) });
      mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });
      mock.expectOne('/api/auth/refresh').flush({}, { status: 0, statusText: 'x' });

      return vi.waitFor(() => {
        expect(error).toBeInstanceOf(ApiError);
        expect(auth.isSignedIn()).toBe(true);
        expect(navigate).not.toHaveBeenCalled();
      });
    });

    it('the refresh call itself never triggers another refresh', () => {
      const { http, mock, auth } = setup(RENEWABLE);

      void auth.renew();
      mock.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });

      mock.expectNone('/api/auth/refresh');
      expect(http).toBeDefined();
    });
  });

  describe('errorInterceptor', () => {
    it('delivers an ApiError with field messages for a validation failure', () => {
      const { http, mock } = setup(SESSION);
      let error: unknown;

      http.post('/api/tasks', {}).subscribe({ error: (e) => (error = e) });
      mock.expectOne('/api/tasks').flush(
        { detail: 'Một hoặc nhiều trường không hợp lệ.', errors: { title: ['Tiêu đề không được để trống.'] }, traceId: 't-1' },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).fieldErrors['title']).toEqual(['Tiêu đề không được để trống.']);
    });

    it('ends the session and goes to login when the server rejects the token', () => {
      const { http, mock, auth, navigate } = setup(SESSION);

      http.get('/api/tasks').subscribe({ error: () => undefined });
      mock.expectOne('/api/tasks').flush({}, { status: 401, statusText: 'Unauthorized' });

      expect(auth.hasValidSession()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired', returnUrl: '/tasks' } });
    });

    it('several simultaneous 401s navigate only once', () => {
      const { http, mock, navigate } = setup(SESSION);

      for (const path of ['/api/a', '/api/b', '/api/c']) {
        http.get(path).subscribe({ error: () => undefined });
      }
      for (const path of ['/api/a', '/api/b', '/api/c']) {
        mock.expectOne(path).flush({}, { status: 401, statusText: 'Unauthorized' });
      }

      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('a 401 from login is just a wrong password: the user is not bounced and gets the server message', () => {
      const { http, mock, navigate } = setup(SESSION);
      let error: ApiError | undefined;

      http.post('/api/auth/login', {}, { context: new HttpContext().set(HANDLE_UNAUTHORIZED, false) })
        .subscribe({ error: (e) => (error = e) });
      mock.expectOne('/api/auth/login').flush({ detail: 'Email hoặc mật khẩu không đúng.' }, { status: 401, statusText: 'Unauthorized' });

      expect(error?.message).toBe('Email hoặc mật khẩu không đúng.');
      expect(navigate).not.toHaveBeenCalled();
    });

    it.each([[403], [404], [409], [500], [0]])('status %i does not end the session', (status) => {
      const { http, mock, auth, navigate } = setup(SESSION);

      http.get('/api/tasks').subscribe({ error: () => undefined });
      mock.expectOne('/api/tasks').flush({}, { status, statusText: 'x' });

      expect(auth.hasValidSession()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('leaves errors from other origins alone', () => {
      const { http, mock } = setup(SESSION);
      let error: unknown;

      http.get('https://example.com/x').subscribe({ error: (e) => (error = e) });
      mock.expectOne('https://example.com/x').flush({}, { status: 500, statusText: 'x' });

      expect(error).not.toBeInstanceOf(ApiError);
    });

    it('passes successful responses through unchanged', () => {
      const { http, mock } = setup(SESSION);
      let body: unknown;

      http.get('/api/tasks').subscribe((b) => (body = b));
      mock.expectOne('/api/tasks').flush({ items: [] });

      expect(body).toEqual({ items: [] });
    });
  });
});
