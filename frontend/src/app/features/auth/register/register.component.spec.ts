import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';
import { Subject, of, throwError } from 'rxjs';

import { AuthService } from '../../../core/auth/auth.service';
import { ApiError } from '../../../core/http/api-error';
import { RegisterComponent } from './register.component';

const USER = { id: 'u1', fullName: 'An', email: 'a@example.com', createdAt: '', updatedAt: '' };

function setup() {
  const register = vi.fn();
  TestBed.configureTestingModule({ providers: [provideRouter([]), provideNzIconsTesting(), { provide: AuthService, useValue: { register } }] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(RegisterComponent);
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
  const fillValid = () => {
    type('fullName', '  Nguyễn Văn An  ');
    type('email', '  An@Example.com ');
    type('password', 'Passw0rd1');
  };
  return { fixture, el, register, navigate, type, submit, fillValid, text: () => el.textContent ?? '' };
}

describe('RegisterComponent', () => {
  it('has labelled fields with the right input types and autocomplete hints', () => {
    const { el } = setup();

    expect(el.querySelector('h1')!.textContent).toBe('Tạo tài khoản');
    expect(el.querySelector('label[for="fullName"]')).not.toBeNull();
    expect(el.querySelector<HTMLInputElement>('#email')!.type).toBe('email');
    expect(el.querySelector<HTMLInputElement>('#password')!.type).toBe('password');
    expect(el.querySelector<HTMLInputElement>('#password')!.autocomplete).toBe('new-password');
  });

  it('links to the login page for people who already have an account', () => {
    expect(setup().el.querySelector('a[href="/login"]')!.textContent).toContain('Đăng nhập');
  });

  it('asks for every field and does not call the server when they are empty', async () => {
    const { submit, text, register } = setup();

    await submit();

    expect(text()).toContain('Vui lòng nhập họ tên.');
    expect(text()).toContain('Vui lòng nhập email.');
    expect(text()).toContain('Vui lòng nhập mật khẩu.');
    expect(register).not.toHaveBeenCalled();
  });

  it('shows which password requirements are met while typing and blocks a weak password', async () => {
    const { type, submit, text, register, el } = setup();
    type('fullName', 'An');
    type('email', 'a@example.com');

    type('password', 'abc');
    expect(el.querySelectorAll('tf-password-rules li.met')).toHaveLength(1);
    await submit();

    expect(text()).toContain('Mật khẩu chưa đạt các yêu cầu bên dưới.');
    expect(register).not.toHaveBeenCalled();

    type('password', 'Passw0rd1');
    expect(el.querySelectorAll('tf-password-rules li.met')).toHaveLength(4);
  });

  it('treats a name of only spaces as missing', async () => {
    const { type, submit, text, register } = setup();
    type('fullName', '    ');
    type('email', 'a@example.com');
    type('password', 'Passw0rd1');

    await submit();

    expect(text()).toContain('Vui lòng nhập họ tên.');
    expect(register).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    const { type, submit, text, register } = setup();
    type('fullName', 'An');
    type('email', 'nope');
    type('password', 'Passw0rd1');

    await submit();

    expect(text()).toContain('Email không hợp lệ.');
    expect(register).not.toHaveBeenCalled();
  });

  it('sends trimmed name and email, keeps the password exactly, then goes home', async () => {
    const { fillValid, submit, register, navigate } = setup();
    register.mockReturnValue(of(USER));

    fillValid();
    await submit();

    expect(register).toHaveBeenCalledWith({ fullName: 'Nguyễn Văn An', email: 'An@Example.com', password: 'Passw0rd1' });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows a taken email under the email field and clears it when the email is edited', async () => {
    const { fillValid, submit, register, text, type } = setup();
    register.mockReturnValue(throwError(() => new ApiError(409, 'trùng', { email: ['Email này đã được sử dụng.'] })));

    fillValid();
    await submit();
    expect(text()).toContain('Email này đã được sử dụng.');

    type('email', 'khac@example.com');
    expect(text()).not.toContain('Email này đã được sử dụng.');
  });

  it('shows server-side password policy messages under the password field', async () => {
    const { fillValid, submit, register, text } = setup();
    register.mockReturnValue(throwError(() => new ApiError(400, 'x', { password: ['Mật khẩu phải có ít nhất một chữ hoa.'] })));

    fillValid();
    await submit();

    expect(text()).toContain('Mật khẩu phải có ít nhất một chữ hoa.');
  });

  it('shows a general failure in an alert and lets the user retry', async () => {
    const { fillValid, submit, register, el } = setup();
    register.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

    fillValid();
    await submit();

    expect(el.querySelector('[role="alert"]')!.textContent).toContain('Không kết nối được máy chủ');
    expect(el.querySelector('button[type="submit"]')!.classList.contains('ant-btn-loading')).toBe(false);
  });

  it('ignores a second submit while the first is running', async () => {
    const { fillValid, submit, register } = setup();
    register.mockReturnValue(new Subject());

    fillValid();
    await submit();
    await submit();

    expect(register).toHaveBeenCalledTimes(1);
  });
});
