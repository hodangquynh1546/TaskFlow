import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';

import { routes } from './app.routes';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';

const VALID = { accessToken: 'tok', expiresAt: '2099-01-01T00:00:00Z' };
const EXPIRED = { accessToken: 'tok', expiresAt: '2000-01-01T00:00:00Z' };
const USER = { id: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', createdAt: '', updatedAt: '' };

async function setup(session?: typeof VALID) {
  localStorage.clear();
  if (session) {
    localStorage.setItem('taskflow.session', JSON.stringify(session));
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
      provideNzIconsTesting(),
    ],
  });
  return { harness: await RouterTestingHarness.create(), router: TestBed.inject(Router), http: TestBed.inject(HttpTestingController) };
}

const text = (el: HTMLElement) => el.textContent ?? '';

describe('application routes (guards, layouts and pages together)', () => {
  it('sends a signed-out visitor from a private page to login and remembers the page', async () => {
    const { harness, router } = await setup();

    await harness.navigateByUrl('/tasks');

    expect(router.url).toBe('/login?returnUrl=%2Ftasks');
    expect(text(harness.routeNativeElement!)).toContain('Đăng nhập');
  });

  it('sends a signed-out visitor from the home page to a clean /login', async () => {
    const { harness, router } = await setup();

    await harness.navigateByUrl('/');

    expect(router.url).toBe('/login');
  });

  it('does not show the app shell to a signed-out visitor', async () => {
    const { harness } = await setup();

    await harness.navigateByUrl('/tasks');

    expect(harness.routeNativeElement!.querySelector('nav')).toBeNull();
  });

  it('treats an expired token as signed out', async () => {
    const { harness, router } = await setup(EXPIRED);

    await harness.navigateByUrl('/tasks');

    expect(router.url).toContain('/login');
  });

  it('keeps a signed-in user on the page they asked for, inside the shell', async () => {
    const { harness, router } = await setup(VALID);

    await harness.navigateByUrl('/anything/at/all');

    expect(router.url).toBe('/anything/at/all');
    const el = harness.routeNativeElement!;
    expect(el.querySelector('nav')).not.toBeNull();
    expect(text(el)).toContain('Không tìm thấy trang này');
    expect(el.querySelector('#main')).not.toBeNull();
  });

  it('regression: a signed-in user opening the home page is not stuck in a redirect loop', async () => {
    // A guest guard on a path-less parent once redirected "/" to "/" forever for signed-in users.
    const { harness, router } = await setup(VALID);
    const starts: string[] = [];
    router.events.subscribe((e) => {
      if (e.constructor.name === 'NavigationStart') {
        starts.push((e as { url: string }).url);
      }
    });

    await harness.navigateByUrl('/');

    expect(router.url).toBe('/dashboard');
    expect(starts.length).toBeLessThanOrEqual(2);
    expect(text(harness.routeNativeElement!)).toContain('Tổng quan');
  });

  it('sends a signed-in user away from the login page', async () => {
    const { harness, router } = await setup(VALID);

    await harness.navigateByUrl('/login');

    expect(router.url).toBe('/dashboard');
  });

  it('shows the expired-session notice on login and, after signing in, returns the user to where they were', async () => {
    const { harness, router, http } = await setup();

    await harness.navigateByUrl('/login?reason=expired&returnUrl=%2Fsomewhere%2Felse');
    const el = harness.routeNativeElement!;
    expect(text(el)).toContain('Phiên đăng nhập đã hết hạn');

    const set = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('email', 'a@example.com');
    set('password', 'Passw0rd1');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ accessToken: 'new', expiresAt: '2099-01-01T00:00:00Z', user: USER });
    await vi.waitFor(() => expect(router.url).toBe('/somewhere/else'));
    expect(JSON.parse(localStorage.getItem('taskflow.session')!).accessToken).toBe('new');
    expect(text(harness.routeNativeElement!)).toContain('Nguyễn Văn A');
  });

  it('an open-redirect attempt in returnUrl lands on the home page, not the other site', async () => {
    const { harness, router, http } = await setup();

    await harness.navigateByUrl('/login?returnUrl=%2F%2Fevil.example');
    const el = harness.routeNativeElement!;
    const set = (id: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    set('email', 'a@example.com');
    set('password', 'Passw0rd1');
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    http.expectOne('/api/auth/login').flush({ accessToken: 'new', expiresAt: '2099-01-01T00:00:00Z', user: USER });
    // Lands on the dashboard (home), which immediately asks the API for data; that is not what is being tested here.
    await vi.waitFor(() => expect(router.url).toBe('/dashboard'));
  });
});
