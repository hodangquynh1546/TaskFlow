import { TestBed } from '@angular/core/testing';

import { TokenStore } from './token-store';

const SESSION = { accessToken: 'token-123', expiresAt: '2030-01-01T00:00:00Z' };

describe('TokenStore', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const create = () => TestBed.inject(TokenStore);

  it('returns null when nothing is stored', () => {
    expect(create().read()).toBeNull();
  });

  it('round-trips a session through localStorage', () => {
    const store = create();
    store.write(SESSION);

    expect(store.read()).toEqual(SESSION);
    expect(JSON.parse(localStorage.getItem('taskflow.session')!)).toEqual(SESSION);
  });

  it('clear removes the stored session', () => {
    const store = create();
    store.write(SESSION);
    store.clear();

    expect(store.read()).toBeNull();
    expect(localStorage.getItem('taskflow.session')).toBeNull();
  });

  it.each([
    ['not json', '{oops'],
    ['wrong shape', JSON.stringify({ accessToken: 5 })],
    ['missing expiry', JSON.stringify({ accessToken: 'x' })],
    ['unparseable expiry', JSON.stringify({ accessToken: 'x', expiresAt: 'tomorrow-ish' })],
    ['null', 'null'],
  ])('treats corrupted storage (%s) as signed out instead of throwing', (_name, raw) => {
    localStorage.setItem('taskflow.session', raw);

    expect(create().read()).toBeNull();
  });

  it('keeps the tab signed in from memory when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const store = create();

    expect(() => store.write(SESSION)).not.toThrow();
    expect(store.read()).toEqual(SESSION);
    expect(() => store.clear()).not.toThrow();
    expect(store.read()).toBeNull();
  });
});
