import { en } from './messages/en';
import { ja } from './messages/ja';
import { vi as viMessages } from './messages/vi';
import { zh } from './messages/zh';

const vi_ = viMessages as Readonly<Record<string, string>>;
const others = { English: en, Japanese: ja, Chinese: zh } as const;
const all = { Vietnamese: vi_, ...others } as Record<string, Readonly<Record<string, string>>>;
const placeholders = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();

describe('message dictionaries', () => {
  it.each(Object.entries(others))('%s has exactly the same keys as Vietnamese', (_name, dictionary) => {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(vi_).sort());
  });

  it('no message is empty', () => {
    for (const [name, dictionary] of Object.entries(all)) {
      for (const [key, text] of Object.entries(dictionary)) {
        expect(text.trim(), `${name} ${key}`).not.toBe('');
      }
    }
  });

  it.each(Object.entries(others))('every %s message uses the same placeholders as Vietnamese, so a parameter is never dropped', (_name, dictionary) => {
    for (const key of Object.keys(vi_)) {
      expect(placeholders((dictionary as Record<string, string>)[key]), key).toEqual(placeholders(vi_[key]));
    }
  });

  it('plural messages are well formed: an "other" branch exists and braces balance', () => {
    for (const [name, dictionary] of Object.entries(all)) {
      for (const [key, text] of Object.entries(dictionary)) {
        expect((text.match(/\{/g) ?? []).length, `${name} ${key}`).toBe((text.match(/\}/g) ?? []).length);
        if (text.includes(', plural,')) {
          expect(text, `${name} ${key}`).toMatch(/other\s*\{/);
        }
      }
    }
  });

  it('the other languages do not contain Vietnamese letters left over from copying', () => {
    // The mascot's name is the one deliberate exception.
    for (const [name, dictionary] of Object.entries(others)) {
      for (const [key, text] of Object.entries(dictionary)) {
        expect(text.replace(/Tí/g, ''), `${name} ${key}`).not.toMatch(/[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i);
      }
    }
  });

  it('Japanese and Chinese are actually translated: no message is still plain English or Vietnamese', () => {
    const kana = /[\u3040-\u30ff\u3400-\u9fff]/;
    // Brand and format tokens are the same in every language.
    const sameEverywhere = new Set(['app.name', 'format.date', 'schedule.dateFormat', 'priority.Medium', 'report.barLabel']);
    for (const [name, dictionary] of [['Japanese', ja], ['Chinese', zh]] as const) {
      for (const [key, text] of Object.entries(dictionary)) {
        if (!sameEverywhere.has(key)) {
          expect(text, `${name} ${key}`).toMatch(kana);
        }
      }
    }
  });
});
