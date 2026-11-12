import { TestBed } from '@angular/core/testing';

import { I18nService, detectLanguage, format } from './i18n.service';

describe('detectLanguage', () => {
  it('uses the stored choice over the browser', () => {
    expect(detectLanguage('en', ['vi-VN'])).toBe('en');
    expect(detectLanguage('vi', ['en-US'])).toBe('vi');
  });

  it('on a first visit follows the browser: Vietnamese for vi, English for anything else', () => {
    expect(detectLanguage(null, ['vi-VN', 'en'])).toBe('vi');
    expect(detectLanguage(null, ['fr-FR', 'en'])).toBe('en');
    expect(detectLanguage(null, ['de'])).toBe('en');
  });

  it('ignores a corrupted stored value and an absent browser list', () => {
    expect(detectLanguage('klingon', ['vi'])).toBe('vi');
    expect(detectLanguage(null, [])).toBe('vi');
  });
});

describe('format', () => {
  it('fills named placeholders and leaves unknown ones visible, so a missing parameter is noticed', () => {
    expect(format('Chào {name}, bạn có {n} việc', { name: 'An', n: 3 }, 'vi-VN')).toBe('Chào An, bạn có 3 việc');
    expect(format('Hi {name} {missing}', { name: 'An' }, 'en-US')).toBe('Hi An {missing}');
  });

  it('chooses the plural form for the language and writes the number in place of #', () => {
    const template = '{n, plural, one {# task} other {# tasks}}';

    expect(format(template, { n: 1 }, 'en-US')).toBe('1 task');
    expect(format(template, { n: 0 }, 'en-US')).toBe('0 tasks');
    expect(format(template, { n: 1234 }, 'en-US')).toBe('1,234 tasks');
    // Vietnamese has one form, so "other" is used for every number.
    expect(format('{n, plural, one {# việc} other {# việc}}', { n: 1 }, 'vi-VN')).toBe('1 việc');
  });

  it('allows several plurals in one message', () => {
    const template = '{a, plural, one {# task} other {# tasks}}, {b, plural, one {# overdue} other {# overdue}}';

    expect(format(template, { a: 2, b: 1 }, 'en-US')).toBe('2 tasks, 1 overdue');
  });

  it('returns the text untouched when there are no parameters', () => {
    expect(format('{not a placeholder}', undefined, 'en-US')).toBe('{not a placeholder}');
  });
});

describe('I18nService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = '';
  });

  it('starts in Vietnamese in this (Vietnamese) test browser and sets the page language', () => {
    const i18n = TestBed.inject(I18nService);

    expect(i18n.lang()).toBe('vi');
    expect(i18n.t('nav.tasks')).toBe('Công việc');
    expect(document.documentElement.lang).toBe('vi');
  });

  it('switches language at once, remembers it and tells the page', () => {
    const i18n = TestBed.inject(I18nService);

    i18n.setLang('en');

    expect(i18n.t('nav.tasks')).toBe('Tasks');
    expect(i18n.locale()).toBe('en-US');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('tf.lang')).toBe('en');
  });

  it('is reactive: a computed that reads a message updates after the switch', () => {
    const i18n = TestBed.inject(I18nService);
    const read = () => i18n.t('status.Completed');

    expect(read()).toBe('Hoàn thành');
    i18n.setLang('en');
    expect(read()).toBe('Done');
  });

  it('interpolates parameters and plurals in the active language', () => {
    const i18n = TestBed.inject(I18nService);

    expect(i18n.t('time.minutesAgo', { n: 5 })).toBe('5 phút trước');
    i18n.setLang('en');
    expect(i18n.t('time.minutesAgo', { n: 1 })).toBe('1 minute ago');
    expect(i18n.t('time.minutesAgo', { n: 5 })).toBe('5 minutes ago');
  });

  it('writes date then time in every language', () => {
    const i18n = TestBed.inject(I18nService);
    const moment = new Date(2026, 10, 12, 21, 5);

    expect(i18n.formatDateTime(moment)).toBe('12/11/2026 21:05');
    i18n.setLang('en');
    expect(i18n.formatDateTime(moment)).toBe('11/12/2026 21:05');
  });

  it('formats numbers for the language', () => {
    const i18n = TestBed.inject(I18nService);

    i18n.setLang('en');
    expect(i18n.formatNumber(1234)).toBe('1,234');
  });

  it('keeps working when storage is unavailable', () => {
    const i18n = TestBed.inject(I18nService);
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => i18n.setLang('en')).not.toThrow();
    expect(i18n.lang()).toBe('en');
    blocked.mockRestore();
  });
});
