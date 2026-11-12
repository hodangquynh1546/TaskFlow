import { givenName } from './names';

describe('givenName', () => {
  it.each([
    ['Nguyễn Văn An', 'An'],
    ['  Trần   Thị  Bình ', 'Bình'],
    ['An', 'An'],
  ])('%j gives %j', (full, expected) => expect(givenName(full)).toBe(expected));

  it.each([[''], ['   '], [null], [undefined]])('gives nothing for %j', (value) => expect(givenName(value)).toBe(''));
});
