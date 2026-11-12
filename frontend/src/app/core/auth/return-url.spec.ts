import { sanitizeReturnUrl } from './return-url';

describe('sanitizeReturnUrl', () => {
  it.each([
    ['/tasks', '/tasks'],
    ['/tasks/123?tab=notes', '/tasks/123?tab=notes'],
    ['/tasks#top', '/tasks#top'],
    ['/', '/'],
  ])('keeps the in-app path %s', (input, expected) => {
    expect(sanitizeReturnUrl(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['tasks'],
    ['//evil.example'],
    ['//evil.example/path'],
    ['https://evil.example'],
    ['http://evil.example'],
    ['javascript:alert(1)'],
    ['/\\evil.example'],
    ['/path\\..\\x'],
    ['/ok\nSet-Cookie: x=1'],
    ['/ok\u0000'],
  ])('falls back to home for %j (open-redirect protection)', (input) => {
    expect(sanitizeReturnUrl(input as string | null | undefined)).toBe('/');
  });

  it('never sends the user back to the login or register page', () => {
    expect(sanitizeReturnUrl('/login')).toBe('/');
    expect(sanitizeReturnUrl('/login?returnUrl=%2Ftasks')).toBe('/');
    expect(sanitizeReturnUrl('/register')).toBe('/');
  });
});
