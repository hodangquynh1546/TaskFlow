import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import { LoginComponent } from './login.component';

const USER = { id: 'u1', fullName: 'An', email: 'a@example.com', createdAt: '', updatedAt: '' };

function setup(inputs: Record<string, string> = {}) {
  const login = vi.fn();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideNzIconsTesting(), { provide: AuthService, useValue: { login } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(LoginComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  const type = (id: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = async () => {
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const text = () => el.textContent ?? '';
  return { fixture, el, login, navigate, type, submit, text };
}

describe('LoginComponent', () => {
  it('has labelled, correctly typed fields with browser-friendly autocomplete', () => {
    const { el } = setup();
    const email = el.querySelector<HTMLInputElement>('#email')!;
    const password = el.querySelector<HTMLInputElement>('#password')!;

    expect(el.querySelector('label[for="email"]')!.textContent).toContain('Email');
    expect(el.querySelector('label[for="password"]')!.textContent).toContain('Mật khẩu');
    expect(email.type).toBe('email');
    expect(email.autocomplete).toBe('username');
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(el.querySelector('h1')!.textContent).toBe('Đăng nhập');
  });

  it('asks for both fields and does not call the server when they are empty', async () => {
    const { submit, text, login } = setup();

    await submit();

    expect(text()).toContain('Vui lòng nhập email.');
    expect(text()).toContain('Vui lòng nhập mật khẩu.');
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email before calling the server', async () => {
    const { submit, type, text, login } = setup();

    type('email', 'not-an-email');
    type('password', 'x');
    await submit();

    expect(text()).toContain('Email không hợp lệ.');
    expect(login).not.toHaveBeenCalled();
  });

  it('sends a trimmed email but the password exactly as typed', async () => {
    const { submit, type, login } = setup();
    login.mockReturnValue(of(USER));

    type('email', '  a@example.com  ');
    type('password', '  Pass w0rd  ');
    await submit();

    expect(login).toHaveBeenCalledWith({ email: 'a@example.com', password: '  Pass w0rd  ' });
  });

  it.each([
    [undefined, '/'],
    ['/tasks?page=2', '/tasks?page=2'],
    ['//evil.example', '/'],
    ['https://evil.example', '/'],
    ['/login', '/'],
  ])('after signing in with returnUrl %j it goes to %j', async (returnUrl, expected) => {
    const { submit, type, login, navigate } = setup(returnUrl === undefined ? {} : { returnUrl });
    login.mockReturnValue(of(USER));

    type('email', 'a@example.com');
    type('password', 'Passw0rd1');
    await submit();

    expect(navigate).toHaveBeenCalledWith(expected);
  });

  it('shows a wrong-password error in an alert, keeps what the user typed and lets them retry', async () => {
    const { submit, type, login, el, fixture } = setup();
    login.mockReturnValue(throwError(() => new ApiError(401, 'Email hoặc mật khẩu không đúng.')));

    type('email', 'a@example.com');
    type('password', 'wrong');
    await submit();

    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Email hoặc mật khẩu không đúng.');
    expect(el.querySelector<HTMLInputElement>('#email')!.value).toBe('a@example.com');
    expect(el.querySelector('button[type="submit"]')!.classList.contains('ant-btn-loading')).toBe(false);

    login.mockReturnValue(of(USER));
    type('password', 'Passw0rd1');
    await submit();
    expect(login).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows network and rate-limit messages', async () => {
    const { submit, type, login, el } = setup();
    login.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

    type('email', 'a@example.com');
    type('password', 'x');
    await submit();

    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Không kết nối được máy chủ');
  });

  it('puts a field-level server message under that field and clears it when the field is edited', async () => {
    const { submit, type, login, text } = setup();
    login.mockReturnValue(throwError(() => new ApiError(400, 'x', { email: ['Email không hợp lệ.'] })));

    type('email', 'a@example.com');
    type('password', 'x');
    await submit();
    expect(text()).toContain('Email không hợp lệ.');

    type('email', 'b@example.com');
    expect(text()).not.toContain('Email không hợp lệ.');
  });

  it('ignores a second submit while the first is still running', async () => {
    const { submit, type, login, el } = setup();
    const pending = new Subject<typeof USER>();
    login.mockReturnValue(pending);

    type('email', 'a@example.com');
    type('password', 'x');
    await submit();
    await submit();

    expect(login).toHaveBeenCalledTimes(1);
    expect(el.querySelector('button[type="submit"]')!.classList.contains('ant-btn-loading')).toBe(true);
  });

  it('explains an expired session only when that is why the user is here', () => {
    expect(setup({ reason: 'expired' }).text()).toContain('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.');
    TestBed.resetTestingModule();
    expect(setup().text()).not.toContain('đã hết hạn');
    TestBed.resetTestingModule();
    expect(setup({ reason: 'something-else' }).text()).not.toContain('đã hết hạn');
  });
});
