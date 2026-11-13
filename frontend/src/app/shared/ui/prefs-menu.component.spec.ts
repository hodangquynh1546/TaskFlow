import { TestBed } from '@angular/core/testing';

import { I18nService } from '../../core/i18n/i18n.service';
import { ThemeService } from '../../core/theme/theme.service';
import { PrefsMenuComponent } from './prefs-menu.component';

function setup() {
  localStorage.clear();
  const fixture = TestBed.createComponent(PrefsMenuComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const open = () => {
    el.querySelector<HTMLButtonElement>('button.trigger')!.click();
    fixture.detectChanges();
  };
  return { fixture, el, open, i18n: TestBed.inject(I18nService), theme: TestBed.inject(ThemeService) };
}

describe('PrefsMenuComponent', () => {
  it('is closed at first, with an accessible name and the current language on the button', () => {
    const { el } = setup();
    const trigger = el.querySelector('button.trigger')!;

    expect(el.querySelector('.panel')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-label')).toBe('Tùy chọn giao diện và ngôn ngữ');
    expect(trigger.textContent).toContain('VI');
  });

  it('opens a panel with three appearance choices and four languages, marking the current ones', () => {
    const { el, open } = setup();
    open();

    const groups = [...el.querySelectorAll('.choices')].map((g) => [...g.querySelectorAll('button')].map((b) => [b.textContent!.trim(), b.getAttribute('aria-pressed')]));
    expect(groups).toEqual([
      [['Sáng', 'false'], ['Tối', 'false'], ['Theo hệ thống', 'true']],
      [['Tiếng Việt', 'true'], ['English', 'false'], ['日本語', 'false'], ['简体中文', 'false']],
    ]);
  });

  it('applies a chosen appearance straight away', () => {
    const { el, open, theme, fixture } = setup();
    open();

    [...el.querySelectorAll<HTMLButtonElement>('.choice')].find((b) => b.textContent!.trim() === 'Tối')!.click();
    fixture.detectChanges();

    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('switches the whole interface language, including its own labels', () => {
    const { el, open, i18n, fixture } = setup();
    open();

    [...el.querySelectorAll<HTMLButtonElement>('.choice')].find((b) => b.textContent!.trim() === 'English')!.click();
    fixture.detectChanges();

    expect(i18n.lang()).toBe('en');
    expect(el.querySelector('button.trigger')!.textContent).toContain('EN');
    expect(el.querySelector('.panel__title')!.textContent).toBe('Appearance');
    expect(el.querySelector('button.trigger')!.getAttribute('aria-label')).toBe('Appearance and language options');
    i18n.setLang('vi');
  });

  it.each([['日本語', 'ja', 'JA', '外観'], ['简体中文', 'zh', 'ZH', '外观']])('switches to %s', (label, code, short, title) => {
    const { el, open, i18n, fixture } = setup();
    open();

    [...el.querySelectorAll<HTMLButtonElement>('.choice')].find((b) => b.textContent!.trim() === label)!.click();
    fixture.detectChanges();

    expect(i18n.lang()).toBe(code);
    expect(document.documentElement.lang).toBe(code);
    expect(el.querySelector('button.trigger')!.textContent).toContain(short);
    expect(el.querySelector('.panel__title')!.textContent).toBe(title);
    i18n.setLang('vi');
  });

  it('closes on Escape and on a click outside, but not on a click inside', () => {
    const { fixture, el, open } = setup();
    open();

    el.querySelector<HTMLElement>('.panel')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.panel')).not.toBeNull();

    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('.panel')).toBeNull();

    open();
    document.body.click();
    fixture.detectChanges();
    expect(el.querySelector('.panel')).toBeNull();
  });
});
