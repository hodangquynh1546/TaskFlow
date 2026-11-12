import { initialsOf } from './initials';

describe('initialsOf', () => {
  it.each([
    ['Nguyễn Văn A', 'NA'],
    ['  Đỗ   Thị  Mai ', 'ĐM'],
    ['nguyễn văn a', 'NA'],
    ['An', 'A'],
    ['Lê Bình', 'LB'],
    ['Ân Ơn', 'ÂƠ'],
  ])('%j gives %j', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined]])('gives nothing for %j', (name) => {
    expect(initialsOf(name)).toBe('');
  });

  it('does not split a surrogate pair', () => {
    expect(initialsOf('😀 Lan')).toBe('😀L');
  });
});
