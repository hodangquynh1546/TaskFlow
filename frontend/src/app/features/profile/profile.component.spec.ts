import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';

import { User } from '../../core/auth/auth.models';
import { ApiError } from '../../core/http/api-error';
import { NotifyService } from '../../core/notify/notify.service';
import { UI_TEST_PROVIDERS } from '../tasks/test-support';
import { ProfileComponent } from './profile.component';
import { ProfileService } from './profile.service';

const USER: User = { id: 'u1', fullName: 'Nguyễn Văn An', email: 'an@example.com', createdAt: '', updatedAt: '' };

async function setup(get: unknown = of(USER)) {
  const profile = { get: vi.fn().mockReturnValue(get), update: vi.fn(), changePassword: vi.fn() };
  const notify = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.configureTestingModule({ providers: [...UI_TEST_PROVIDERS, { provide: ProfileService, useValue: profile }, { provide: NotifyService, useValue: notify }] });
  const fixture = TestBed.createComponent(ProfileComponent);
  fixture.detectChanges();
  const settle = async () => {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  };
  await settle();
  const el = fixture.nativeElement as HTMLElement;
  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = async (n: 0 | 1) => {
    el.querySelectorAll<HTMLFormElement>('form')[n].dispatchEvent(new Event('submit'));
    await settle();
  };
  return { fixture, el, profile, notify, type, submit, settle, text: () => el.textContent ?? '' };
}

// The info form is the first form on the page and the password form the second; ids differ so inputs never clash.
const infoName = '#fullName';
const infoEmail = '#email';
const emailPassword = '#emailPassword';

describe('ProfileComponent', () => {
  describe('loading', () => {
    it('shows a skeleton until the profile arrives', async () => {
      const { el } = await setup(new Subject());

      expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
      expect(el.querySelector('form')).toBeNull();
    });

    it('fills the form with the account details', async () => {
      const { el } = await setup();

      expect(el.querySelector<HTMLInputElement>(infoName)!.value).toBe('Nguyễn Văn An');
      expect(el.querySelector<HTMLInputElement>(infoEmail)!.value).toBe('an@example.com');
    });

    it('shows a failure with a retry', async () => {
      const { el, profile, settle } = await setup(throwError(() => new ApiError(500, 'Có lỗi từ máy chủ. Thử lại sau ít phút.')));
      expect(el.querySelector('[role="alert"]')!.textContent).toContain('Có lỗi từ máy chủ');

      profile.get.mockReturnValue(of(USER));
      el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
      await settle();

      expect(el.querySelector<HTMLInputElement>(infoName)!.value).toBe('Nguyễn Văn An');
    });

    it('has two labelled sections', async () => {
      const { el } = await setup();

      expect([...el.querySelectorAll('section h2')].map((h) => h.textContent)).toEqual(['Thông tin tài khoản', 'Đổi mật khẩu']);
    });
  });

  describe('account details', () => {
    it('asks for the current password only while the email is being changed', async () => {
      const { el, type } = await setup();
      expect(el.querySelector(emailPassword)).toBeNull();

      type(infoEmail, 'moi@example.com');
      expect(el.querySelector(emailPassword)).not.toBeNull();

      type(infoEmail, 'an@example.com');
      expect(el.querySelector(emailPassword)).toBeNull();
    });

    it('a change of case or surrounding spaces is not an email change', async () => {
      const { el, type } = await setup();

      type(infoEmail, '  AN@Example.COM ');

      expect(el.querySelector(emailPassword)).toBeNull();
    });

    it('saves a new name without a password and without sending one', async () => {
      const { el, profile, notify, type, submit } = await setup();
      profile.update.mockReturnValue(of({ ...USER, fullName: 'Tên Mới' }));

      type(infoName, '  Tên Mới  ');
      await submit(0);

      expect(profile.update).toHaveBeenCalledWith({ fullName: 'Tên Mới', email: 'an@example.com' });
      expect(Object.keys(profile.update.mock.calls[0][0])).not.toContain('currentPassword');
      expect(notify.success).toHaveBeenCalledWith('Đã lưu thay đổi');
      expect(el.querySelector<HTMLInputElement>(infoName)!.value).toBe('Tên Mới');
    });

    it('will not change the email without the current password, and says why', async () => {
      const { profile, type, submit, text } = await setup();

      type(infoEmail, 'moi@example.com');
      await submit(0);

      expect(text()).toContain('Nhập mật khẩu hiện tại để đổi email.');
      expect(profile.update).not.toHaveBeenCalled();
    });

    it('changes the email with the current password, then treats the new email as the baseline', async () => {
      const { el, profile, type, submit, notify } = await setup();
      profile.update.mockReturnValue(of({ ...USER, email: 'moi@example.com' }));

      type(infoEmail, 'moi@example.com');
      type(emailPassword, 'Passw0rd1');
      await submit(0);

      expect(profile.update).toHaveBeenCalledWith({ fullName: 'Nguyễn Văn An', email: 'moi@example.com', currentPassword: 'Passw0rd1' });
      expect(notify.success).toHaveBeenCalledWith('Đã lưu thay đổi');
      expect(el.querySelector(emailPassword)).toBeNull();
      expect(el.querySelector<HTMLInputElement>(infoEmail)!.value).toBe('moi@example.com');
    });

    it('does not send a password typed earlier if the email was changed back', async () => {
      const { profile, type, submit } = await setup();
      profile.update.mockReturnValue(of(USER));

      type(infoEmail, 'moi@example.com');
      type(emailPassword, 'Passw0rd1');
      type(infoEmail, 'an@example.com');
      await submit(0);

      expect(Object.keys(profile.update.mock.calls[0][0])).not.toContain('currentPassword');
    });

    it('rejects a blank name and a malformed email without calling the server', async () => {
      const { profile, type, submit, text } = await setup();

      type(infoName, '   ');
      type(infoEmail, 'nope');
      await submit(0);

      expect(text()).toContain('Vui lòng nhập họ tên.');
      expect(text()).toContain('Email không hợp lệ.');
      expect(profile.update).not.toHaveBeenCalled();
    });

    it('shows "email already used" under the email field', async () => {
      const { profile, type, submit, text } = await setup();
      profile.update.mockReturnValue(throwError(() => new ApiError(409, 'trùng', { email: ['Email này đã được sử dụng.'] })));

      type(infoEmail, 'trung@example.com');
      type(emailPassword, 'Passw0rd1');
      await submit(0);

      expect(text()).toContain('Email này đã được sử dụng.');
    });

    it('shows "wrong password" under the password field when changing the email', async () => {
      const { profile, type, submit, text } = await setup();
      profile.update.mockReturnValue(throwError(() => new ApiError(400, 'x', { currentPassword: ['Cần nhập đúng mật khẩu hiện tại để đổi email.'] })));

      type(infoEmail, 'moi@example.com');
      type(emailPassword, 'sai');
      await submit(0);

      expect(text()).toContain('Cần nhập đúng mật khẩu hiện tại để đổi email.');
    });

    it('shows an unexpected failure in an alert and keeps what the user typed', async () => {
      const { el, profile, type, submit } = await setup();
      profile.update.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

      type(infoName, 'Tên Dở Dang');
      await submit(0);

      expect(el.querySelector('form [role="alert"]')!.textContent).toContain('Không kết nối được máy chủ');
      expect(el.querySelector<HTMLInputElement>(infoName)!.value).toBe('Tên Dở Dang');
    });

    it('ignores a second submit while saving', async () => {
      const { profile, type, submit } = await setup();
      profile.update.mockReturnValue(new Subject());

      type(infoName, 'Tên Khác');
      await submit(0);
      await submit(0);

      expect(profile.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('changing the password', () => {
    const fill = (type: (s: string, v: string) => void, current: string, next: string) => {
      type('#currentPassword', current);
      type('#newPassword', next);
    };

    it('asks for both passwords', async () => {
      const { profile, submit, text } = await setup();

      await submit(1);

      expect(text()).toContain('Vui lòng nhập mật khẩu hiện tại.');
      expect(text()).toContain('Vui lòng nhập mật khẩu mới.');
      expect(profile.changePassword).not.toHaveBeenCalled();
    });

    it('shows which requirements the new password still misses and blocks a weak one', async () => {
      const { el, profile, type, submit, text } = await setup();

      fill(type, 'Passw0rd1', 'abc');
      expect(el.querySelectorAll('tf-password-rules li.met')).toHaveLength(1);
      await submit(1);

      expect(text()).toContain('Mật khẩu mới chưa đạt các yêu cầu bên dưới.');
      expect(profile.changePassword).not.toHaveBeenCalled();
    });

    it('changes the password, thanks the user and empties both fields', async () => {
      const { el, profile, notify, type, submit } = await setup();
      profile.changePassword.mockReturnValue(of(undefined));

      fill(type, 'Passw0rd1', 'NewPassw0rd2');
      await submit(1);

      expect(profile.changePassword).toHaveBeenCalledWith({ currentPassword: 'Passw0rd1', newPassword: 'NewPassw0rd2' });
      expect(notify.success).toHaveBeenCalledWith('Đã đổi mật khẩu');
      expect(el.querySelector<HTMLInputElement>('#currentPassword')!.value).toBe('');
      expect(el.querySelector<HTMLInputElement>('#newPassword')!.value).toBe('');
    });

    it('shows a wrong current password under that field and keeps the new one', async () => {
      const { el, profile, type, submit, text } = await setup();
      profile.changePassword.mockReturnValue(throwError(() => new ApiError(400, 'x', { currentPassword: ['Mật khẩu hiện tại không đúng.'] })));

      fill(type, 'sai', 'NewPassw0rd2');
      await submit(1);

      expect(text()).toContain('Mật khẩu hiện tại không đúng.');
      expect(el.querySelector<HTMLInputElement>('#newPassword')!.value).toBe('NewPassw0rd2');
    });

    it('shows "must differ from the current one" under the new password', async () => {
      const { profile, type, submit, text } = await setup();
      profile.changePassword.mockReturnValue(throwError(() => new ApiError(400, 'x', { newPassword: ['Mật khẩu mới phải khác mật khẩu hiện tại.'] })));

      fill(type, 'Passw0rd1', 'Passw0rd1');
      await submit(1);

      expect(text()).toContain('Mật khẩu mới phải khác mật khẩu hiện tại.');
    });

    it('a failure of one form does not disturb the other', async () => {
      const { el, profile, type, submit } = await setup();
      profile.changePassword.mockReturnValue(throwError(() => new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')));

      type(infoName, 'Tên Đang Sửa');
      fill(type, 'Passw0rd1', 'NewPassw0rd2');
      await submit(1);

      expect(el.querySelector<HTMLInputElement>(infoName)!.value).toBe('Tên Đang Sửa');
    });
  });
});
