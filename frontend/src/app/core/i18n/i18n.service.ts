import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { NzI18nInterface, NzI18nService, en_US, ja_JP, vi_VN, zh_CN } from 'ng-zorro-antd/i18n';

import { en } from './messages/en';
import { ja } from './messages/ja';
import { MessageKey, vi } from './messages/vi';
import { zh } from './messages/zh';

export type Lang = 'vi' | 'en' | 'ja' | 'zh';
export type MessageParams = Readonly<Record<string, string | number>>;

export const LANGUAGES: readonly { readonly code: Lang; readonly label: string; readonly short: string }[] = [
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: 'JA' },
  { code: 'zh', label: '简体中文', short: 'ZH' },
];

const STORAGE_KEY = 'tf.lang';
const DICTIONARIES: Record<Lang, Readonly<Record<MessageKey, string>>> = { vi, en, ja, zh };
const INTL_LOCALE: Record<Lang, string> = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };
const NZ_LOCALE: Record<Lang, NzI18nInterface> = { vi: vi_VN, en: en_US, ja: ja_JP, zh: zh_CN };
const LANGUAGE_CODES: readonly Lang[] = ['vi', 'en', 'ja', 'zh'];

/** Browser preference decides only the first visit; after that the stored choice wins. */
export function detectLanguage(stored: string | null, browserLanguages: readonly string[]): Lang {
  const saved = LANGUAGE_CODES.find((code) => code === stored);
  if (saved) {
    return saved;
  }
  // The first browser language we support wins, so a Japanese browser that also lists English opens in Japanese.
  for (const tag of browserLanguages) {
    const match = LANGUAGE_CODES.find((code) => tag.toLowerCase().startsWith(code));
    if (match) {
      return match;
    }
  }
  return browserLanguages.length > 0 ? 'en' : 'vi';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Message lookup. Values may use `{name}` placeholders and one ICU-style plural per message:
 * `{n, plural, one {# task} other {# tasks}}` (`#` is the number). Plural category comes from Intl.PluralRules so
 * languages with more forms work without code changes.
 */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly nzI18n = inject(NzI18nService, { optional: true });

  private readonly current = signal<Lang>(
    detectLanguage(readStored(), typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language])),
  );

  /** Reading this inside a template or computed makes it re-render when the language changes. */
  readonly lang = this.current.asReadonly();
  readonly locale = computed(() => INTL_LOCALE[this.current()]);

  constructor() {
    this.apply(this.current());
  }

  setLang(lang: Lang): void {
    this.current.set(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
    this.apply(lang);
  }

  t(key: MessageKey, params?: MessageParams): string {
    const lang = this.current();
    const template = DICTIONARIES[lang][key] ?? DICTIONARIES.vi[key] ?? key;
    return format(template, params, INTL_LOCALE[lang]);
  }

  formatDate(value: Date | string | number, options: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale(), options).format(new Date(value));
  }

  /** "12/11/2026 21:05": date then time in every language (Intl would put the time first in Vietnamese). */
  formatDateTime(value: Date | string | number): string {
    const date = this.formatDate(value, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const time = this.formatDate(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return `${date} ${time}`;
  }

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale(), options).format(value);
  }

  private apply(lang: Lang): void {
    this.document.documentElement.lang = lang;
    this.nzI18n?.setLocale(NZ_LOCALE[lang]);
  }
}

const PLURAL = /\{(\w+),\s*plural,\s*((?:\w+\s*\{[^}]*\}\s*)+)\}/g;
const PLURAL_BRANCH = /(\w+)\s*\{([^}]*)\}/g;

export function format(template: string, params: MessageParams | undefined, locale: string): string {
  if (!params) {
    return template;
  }
  const withPlurals = template.replace(PLURAL, (_, name: string, branches: string) => {
    const value = Number(params[name]);
    const category = new Intl.PluralRules(locale).select(value);
    const map = new Map<string, string>();
    for (const m of branches.matchAll(PLURAL_BRANCH)) {
      map.set(m[1], m[2]);
    }
    const text = map.get(category) ?? map.get('other') ?? '';
    return text.replaceAll('#', new Intl.NumberFormat(locale).format(value));
  });
  return withPlurals.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
