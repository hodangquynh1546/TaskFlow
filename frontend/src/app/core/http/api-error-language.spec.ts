import { HttpErrorResponse } from '@angular/common/http';

import { format } from '../i18n/i18n.service';
import { en } from '../i18n/messages/en';
import { toApiError } from './api-error';

const tEn = (key: keyof typeof en, params?: Record<string, string | number>) => format(en[key], params, 'en-US');
const problem = (status: number, body: object) => new HttpErrorResponse({ status, error: body });

describe('toApiError language', () => {
  it('shows the backend message as it came: the backend already answered in the requested language', () => {
    const error = toApiError(problem(409, { detail: 'This email is already in use.', errors: { email: ['This email is already in use.'] } }), tEn);

    expect(error.message).toBe('This email is already in use.');
    expect(error.fieldErrors['email']).toEqual(['This email is already in use.']);
  });

  it('builds the texts it makes itself in the active language', () => {
    expect(toApiError(problem(0, {}), tEn).message).toBe('Can’t reach the server. Check your connection and try again.');
    expect(toApiError(problem(429, {}), tEn).message).toBe('You’re going too fast. Try again in a few minutes.');
    expect(toApiError(problem(500, { traceId: 'abc' }), tEn).message).toBe('The server had a problem. Try again in a few minutes. Reference: abc');
    expect(toApiError(problem(404, {}), tEn).message).toBe('We can’t find this.');
  });
});
