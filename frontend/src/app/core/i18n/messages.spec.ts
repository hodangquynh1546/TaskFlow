import { en } from './messages/en';
import { vi as viMessages } from './messages/vi';

const vi_ = viMessages as Readonly<Record<string, string>>;
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();

describe('message dictionaries', () => {
  it('English and Vietnamese have exactly the same keys', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi_).sort());
  });

  it('no message is empty', () => {
    for (const [key, text] of [...Object.entries(vi_), ...Object.entries(en)]) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('every message uses the same placeholders in both languages, so a parameter is never dropped', () => {
    for (const key of Object.keys(vi_)) {
      expect(placeholders(en[key as keyof typeof en]), key).toEqual(placeholders(vi_[key]));
    }
  });

  it('plural messages are well formed: an "other" branch exists and braces balance', () => {
    for (const [key, text] of [...Object.entries(vi_), ...Object.entries(en)]) {
      expect((text.match(/\{/g) ?? []).length, key).toBe((text.match(/\}/g) ?? []).length);
      if (text.includes(', plural,')) {
        expect(text, key).toMatch(/other\s*\{/);
      }
    }
  });

  it('English messages do not contain Vietnamese letters left over from copying', () => {
    // The mascot's name is the one deliberate exception.
    for (const [key, text] of Object.entries(en)) {
      expect(text.replace(/Tí/g, ''), key).not.toMatch(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
    }
  });
});
