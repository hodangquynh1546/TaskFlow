import { TestBed } from '@angular/core/testing';

import { ThemeService, applyStoredTheme, applyTheme, readStoredMode, resolveTheme } from './theme.service';

describe('theme helpers', () => {
  it('follows the system only in "system" mode', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('applyTheme sets data-theme on <html> and the browser chrome colour', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#fff">';

    applyTheme(document, 'dark');

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#14122e');
    applyTheme(document, 'light');
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#f1f6ff');
  });

  it('reads only valid stored modes, otherwise "system"', () => {
    localStorage.clear();
    expect(readStoredMode()).toBe('system');
    localStorage.setItem('tf.theme', 'dark');
    expect(readStoredMode()).toBe('dark');
    localStorage.setItem('tf.theme', 'purple');
    expect(readStoredMode()).toBe('system');
  });

  it('applyStoredTheme (used before the first render) honours the stored mode', () => {
    localStorage.setItem('tf.theme', 'dark');

    applyStoredTheme(document, window);

    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    document.documentElement.classList.remove('tf-theme-fade');
  });

  it('starts in system mode, which is light when the system does not ask for dark', () => {
    const theme = TestBed.inject(ThemeService);

    expect(theme.mode()).toBe('system');
    expect(theme.resolved()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('applies and remembers an explicit choice', () => {
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');

    expect(theme.resolved()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('tf.theme')).toBe('dark');
  });

  it('going back to "system" forgets the stored choice', () => {
    const theme = TestBed.inject(ThemeService);
    theme.setMode('dark');

    theme.setMode('system');

    expect(localStorage.getItem('tf.theme')).toBeNull();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('turns on the colour cross-fade briefly, and only for the switch', async () => {
    vi.useFakeTimers();
    const theme = TestBed.inject(ThemeService);

    theme.setMode('dark');
    expect(document.documentElement.classList.contains('tf-theme-fade')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(document.documentElement.classList.contains('tf-theme-fade')).toBe(false);
    vi.useRealTimers();
  });
});
