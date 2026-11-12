import { format, MessageParams } from './i18n.service';
import { vi, MessageKey } from './messages/vi';

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * Vietnamese translator with no Angular dependency. Pure helpers (due dates, durations...) default to it, so they stay
 * unit-testable without a TestBed; components pass `i18n.t` to follow the active language.
 */
export const viTranslate: Translate = (key, params) => format(vi[key], params, 'vi-VN');
