import { FormControl } from '@angular/forms';

import { checkPassword, passwordPolicyValidator } from './password-rules';

const metIds = (password: string) => checkPassword(password).filter((r) => r.met).map((r) => r.id);

describe('checkPassword (mirrors the backend policy AC-03)', () => {
  it('reports each requirement independently', () => {
    expect(metIds('')).toEqual([]);
    expect(metIds('abc')).toEqual(['lower']);
    expect(metIds('ABC')).toEqual(['upper']);
    expect(metIds('123')).toEqual(['digit']);
    expect(metIds('Passw0rd')).toEqual(['length', 'upper', 'lower', 'digit']);
  });

  it('counts Vietnamese letters as upper and lower case', () => {
    expect(metIds('ĐÂ')).toContain('upper');
    expect(metIds('đâ')).toContain('lower');
    expect(metIds('mẬtkhẩu1')).toEqual(['length', 'upper', 'lower', 'digit']);
  });

  it('length is 8 to 128 inclusive', () => {
    expect(metIds('Aa1xxxx')).not.toContain('length'); // 7
    expect(metIds('Aa1xxxxx')).toContain('length'); // 8
    expect(metIds('Aa1' + 'x'.repeat(125))).toContain('length'); // 128
    expect(metIds('Aa1' + 'x'.repeat(126))).not.toContain('length'); // 129
  });

  it('gives each rule a label to show', () => {
    expect(checkPassword('').map((r) => r.label)).toEqual(['Ít nhất 8 ký tự', 'Một chữ hoa', 'Một chữ thường', 'Một chữ số']);
  });
});

describe('passwordPolicyValidator', () => {
  const validate = (value: unknown) => passwordPolicyValidator()(new FormControl(value));

  it('accepts a compliant password', () => {
    expect(validate('Passw0rd')).toBeNull();
  });

  it.each([['abc'], ['alllowercase1'], ['NoDigitsHere'], ['Short1A']])('rejects %j', (value) => {
    expect(validate(value)).toEqual({ passwordPolicy: true });
  });

  it('leaves emptiness to the required validator', () => {
    expect(validate('')).toBeNull();
    expect(validate(null)).toBeNull();
  });
});
