import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';

import { User } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ShellComponent } from './shell.component';

const USER: User = { id: 'u1', fullName: 'Nguyễn Văn A', email: 'a@example.com', createdAt: '', updatedAt: '' };

@Component({ template: '' })
class BlankPage {}

function setup(user: User | null = USER) {
  const signOut = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: BlankPage }]),
      provideNzIconsTesting(),
      { provide: AuthService, useValue: { user: signal(user).asReadonly(), signOut } },
    ],
  });
  const fixture = TestBed.createComponent(ShellComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, signOut };
}

const overlay = () => document.querySelector('.cdk-overlay-container') as HTMLElement;
/** NG-ZORRO overlays open after a short delay and need real timers, so give them a few turns. */
const flush = async (fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) => {
  for (let i = 0; i < 8; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 50));
  }
};

/** The dropdown opens on a hover-then-click sequence, like a real pointer. */
const press = (button: HTMLElement) => {
  for (const type of ['mouseenter', 'mousedown', 'mouseup', 'click']) {
    button.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }
};

describe('ShellComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((o) => (o.innerHTML = ''));
  });

  it('shows the navigation with a link per page', () => {
    const { el } = setup();
    const links = [...el.querySelectorAll('aside nav a')].map((a) => ({ text: a.textContent?.trim(), href: a.getAttribute('href') }));

    expect(links).toEqual([
      { text: 'Tổng quan', href: '/dashboard' },
      { text: 'Lịch ngày', href: '/schedule' },
      { text: 'Công việc', href: '/tasks' },
      { text: 'Hồ sơ', href: '/profile' },
    ]);
  });

  it('labels the navigation landmark and the main region', () => {
    const { el } = setup();

    expect(el.querySelector('nav')!.getAttribute('aria-label')).toBe('Điều hướng chính');
    expect(el.querySelector('main#main')).not.toBeNull();
  });

  it('offers a skip link that targets the main region', () => {
    const { el } = setup();
    const skip = el.querySelector('.tf-skip-link') as HTMLAnchorElement;

    expect(skip.getAttribute('href')).toBe('#main');
    skip.click();
    expect(document.activeElement?.id).toBe('main');
  });

  it('links the brand to the home page and offers "Tạo công việc"', () => {
    const { el } = setup();

    expect(el.querySelector('.brand')!.getAttribute('href')).toBe('/');
    const create = el.querySelector('a.create')!;
    expect(create.getAttribute('href')).toBe('/tasks/new');
    expect(create.textContent).toContain('Tạo công việc');
  });

  it('shows the signed-in user as initials and name', () => {
    const { el } = setup();

    expect(el.querySelector('.avatar')!.textContent?.trim()).toBe('NA');
    expect(el.querySelector('.user__name')!.textContent?.trim()).toBe('Nguyễn Văn A');
    expect(el.querySelector('.user')!.getAttribute('aria-label')).toBe('Tài khoản Nguyễn Văn A');
  });

  it('renders safely while the user is not loaded yet', () => {
    const { el } = setup(null);

    expect(el.querySelector('.avatar')!.textContent?.trim()).toBe('');
    expect(el.querySelector('.user__name')!.textContent?.trim()).toBe('');
  });

  it('hides the avatar from assistive technology (the button already has a label)', () => {
    expect(setup().el.querySelector('.avatar')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the account menu with name, email, profile and sign out', async () => {
    const { fixture, el } = setup();

    press(el.querySelector('.user') as HTMLButtonElement);
    await flush(fixture);

    const menu = overlay().textContent ?? '';
    expect(menu).toContain('Nguyễn Văn A');
    expect(menu).toContain('a@example.com');
    expect(menu).toContain('Hồ sơ');
    expect(menu).toContain('Đăng xuất');
  });

  it('signs out from the account menu', async () => {
    const { fixture, el, signOut } = setup();

    press(el.querySelector('.user') as HTMLButtonElement);
    await flush(fixture);
    const item = [...overlay().querySelectorAll('li')].find((li) => li.textContent?.trim() === 'Đăng xuất') as HTMLElement;
    item.click();

    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('has no drawer: phones get a bottom tab bar with the same pages and a create button', () => {
    const { el } = setup();
    const tabBar = el.querySelector('tf-tab-bar')!;

    expect(document.querySelector('.ant-drawer')).toBeNull();
    expect([...tabBar.querySelectorAll('a.tab')].map((a) => a.getAttribute('href'))).toEqual(['/dashboard', '/schedule', '/tasks', '/profile']);
    const fab = tabBar.querySelector('a.fab')!;
    expect(fab.getAttribute('href')).toBe('/tasks/new');
    expect(fab.getAttribute('aria-label')).toBe('Tạo công việc');
  });

  it('puts the language and appearance options in the header', () => {
    const { el } = setup();

    expect(el.querySelector('header tf-prefs button.trigger')).not.toBeNull();
  });
});
