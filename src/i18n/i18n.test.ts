import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTranslator } from './index';
import { DEFAULT_LANGUAGE, LANGUAGES, directionOf, isLanguage, languageInfo } from './languages';
import { en, type PluralBase } from './locales/en';
import { getDictionary, isLocaleLoaded, loadLocale, registerLocale } from './registry';

const english = en as Record<string, string>;
const codes = LANGUAGES.map((language) => language.code);
const others = codes.filter((code) => code !== 'en');

/** Bidi isolates are invisible; strip them to compare the words. */
const plain = (text: string) => text.replace(/[\u2066-\u2069]/g, '');
const SAMPLE_PARAMS = { amount: '€5', date: '1 May', month: 'May', total: 30, current: 2, currency: 'EUR', query: 'q', name: 'Alex', max: 40, percent: 50, earned: '€5' };

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!));
const PLURAL_KEY = /^(.+)\.(zero|one|two|few|many|other)$/;
const pluralBases = [...new Set(Object.keys(english).flatMap((key) => (key.endsWith('.other') ? [key.slice(0, -6)] : [])))];

beforeAll(async () => {
  await Promise.all(codes.map((code) => loadLocale(code)));
});

describe('the language list', () => {
  it('offers exactly the 12 required languages, written in their own scripts', () => {
    expect(LANGUAGES.map((l) => [l.code, l.nativeName])).toEqual([
      ['en', 'English'],
      ['zh', '中文 (简体)'],
      ['hi', 'हिन्दी'],
      ['es', 'Español'],
      ['fr', 'Français'],
      ['ar', 'العربية'],
      ['bn', 'বাংলা'],
      ['pt', 'Português'],
      ['ru', 'Русский'],
      ['ur', 'اردو'],
      ['id', 'Bahasa Indonesia'],
      ['ja', '日本語'],
    ]);
  });

  it('marks Arabic and Urdu (only) as right-to-left', () => {
    expect(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code)).toEqual(['ar', 'ur']);
    expect(directionOf('ar')).toBe('rtl');
    expect(directionOf('en')).toBe('ltr');
    expect(directionOf('zz')).toBe('ltr');
  });

  it('keeps the first-paint script in step with the language list', () => {
    const script = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../public/theme-init.js'), 'utf8');
    const listed = [...script.matchAll(/language === '(\w+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual(LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code).sort());
  });

  it('recognises supported codes only', () => {
    expect(isLanguage('ur')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
    expect(languageInfo('zz').code).toBe(DEFAULT_LANGUAGE);
  });
});

describe.each(others)('%s translations', (code) => {
  const dictionary = () => getDictionary(code)!;

  it('are loaded on demand', () => {
    expect(isLocaleLoaded(code)).toBe(true);
  });

  it('define every English key — nothing is missing', () => {
    const missing = Object.keys(english).filter((key) => !(key in dictionary()));
    expect(missing).toEqual([]);
  });

  it('define no keys English does not know about (apart from extra plural forms)', () => {
    const unknown = Object.keys(dictionary()).filter((key) => {
      if (key in english) return false;
      const match = PLURAL_KEY.exec(key);
      return !(match && pluralBases.includes(match[1]!));
    });
    expect(unknown).toEqual([]);
  });

  it('have no empty, placeholder-only or TODO strings', () => {
    for (const [key, value] of Object.entries(dictionary())) {
      expect(value.trim(), key).not.toBe('');
      expect(value, key).not.toMatch(/\bTODO\b|FIXME|lorem ipsum/);
    }
  });

  it('keep the same {placeholders} as English', () => {
    for (const [key, value] of Object.entries(dictionary())) {
      const plural = PLURAL_KEY.exec(key);
      if (plural && !(key in english)) {
        // Extra plural forms: only values already used by English's `other` form are allowed.
        const allowed = placeholders(english[`${plural[1]}.other`]!);
        for (const name of placeholders(value)) expect(allowed.has(name), `${key} uses {${name}}`).toBe(true);
        continue;
      }
      const wanted = placeholders(english[key]!);
      const got = placeholders(value);
      if (plural) {
        // "one"/"two" forms may spell the number out instead of using {count}.
        wanted.delete('count');
        got.delete('count');
      }
      expect([...got].sort(), key).toEqual([...wanted].sort());
    }
  });

  it('cover every plural form this language needs', () => {
    const rules = new Intl.PluralRules(code);
    const needed = new Set<string>();
    for (let n = 0; n <= 200; n += 1) needed.add(rules.select(n));
    for (const base of pluralBases) {
      for (const category of needed) {
        expect(dictionary(), `${base}.${category}`).toHaveProperty([`${base}.${category}`]);
      }
    }
  });

  it('produce sensible text for every count (no stray braces)', () => {
    const { tn } = createTranslator(code, languageInfo(code).defaultLocale);
    for (const base of pluralBases as PluralBase[]) {
      for (const count of [0, 1, 2, 3, 5, 11, 21, 100]) {
        const text = plain(tn(base, count, SAMPLE_PARAMS));
        expect(text, `${base} × ${count}`).not.toMatch(/[{}]/);
        expect(text.trim(), `${base} × ${count}`).not.toBe('');
      }
    }
  });

  it('are really translated, not English left in place', () => {
    const latin = ['es', 'fr', 'pt', 'id'].includes(code);
    const untouched = Object.entries(english).filter(([key, value]) => {
      if (key === 'app.name' || value.length < 14) return false;
      const translated = dictionary()[key]!;
      return latin ? translated === value : !/\P{ASCII}/u.test(translated);
    });
    expect(untouched.map(([key]) => key)).toEqual([]);
  });
});

describe('createTranslator', () => {
  it('interpolates placeholders and leaves unknown ones visible', () => {
    const { t } = createTranslator('en', 'en-US');
    expect(t('home.left', { amount: '€550' })).toBe('€550 left');
    expect(t('home.left')).toBe('{amount} left');
  });

  it('writes numbers with the locale’s own digits', () => {
    expect(createTranslator('en', 'en-US').t('onboarding.step', { current: 2, total: 4 })).toBe('Step 2 of 4');
    expect(createTranslator('bn', 'bn-BD').t('onboarding.step', { current: 2, total: 4 })).toBe('ধাপ ২ / ৪');
    expect(createTranslator('ar', 'ar-EG').t('onboarding.step', { current: 2, total: 4 })).toContain('٢');
  });

  it('chooses plural forms the way each language does', () => {
    const en = createTranslator('en', 'en-US');
    expect(en.tn('insights.streak.value', 1)).toBe('1 day');
    expect(en.tn('insights.streak.value', 3)).toBe('3 days');
    const ru = createTranslator('ru', 'ru-RU');
    expect([1, 3, 5, 21, 11].map((n) => ru.tn('insights.streak.value', n))).toEqual(['1 день', '3 дня', '5 дней', '21 день', '11 дней']);
    // Arabic distinguishes zero, one, two, few (3–10), many (11–99) and other (100+).
    const ar = createTranslator('ar', 'ar');
    expect([0, 1, 2, 3, 11, 100].map((n) => plain(ar.tn('insights.streak.value', n)))).toEqual([
      'لا أيام',
      'يوم واحد',
      'يومان',
      '3 أيام',
      '11 يومًا',
      '100 يوم',
    ]);
    expect(createTranslator('ja', 'ja-JP').tn('insights.streak.value', 3)).toBe('3日');
    expect(createTranslator('pt', 'pt-BR').tn('insights.streak.value', 1)).toBe('1 dia');
  });

  it('isolates inserted values in right-to-left text, and names everywhere', () => {
    const FSI = '⁨';
    const PDI = '⁩';
    expect(createTranslator('ar', 'ar').t('home.left', { amount: '€5' })).toBe(`المتبقي ${FSI}€5${PDI}`);
    expect(createTranslator('en', 'en-US').t('home.left', { amount: '€5' })).toBe('€5 left');
    expect(createTranslator('en', 'en-US').t('greeting.welcome', { name: 'Alex' })).toBe(`Welcome, ${FSI}Alex${PDI}!`);
    expect(createTranslator('ur', 'ur-PK').t('greeting.welcome', { name: 'Alex' })).toBe(`خوش آمدید، ${FSI}Alex${PDI}!`);
  });

  it('falls back to English for a missing key, then to the key itself — never a blank', () => {
    registerLocale('zh', { 'common.cancel': '取消' });
    const sparse = createTranslator('zh', 'zh-CN');
    expect(sparse.t('common.cancel')).toBe('取消');
    expect(sparse.t('common.delete')).toBe('Delete');
    expect(sparse.tn('insights.streak.value', 3)).toBe('3 days');
    expect(sparse.t('no.such.key' as never)).toBe('no.such.key');
  });

  it('falls back to English when a language has not been loaded or is unknown', () => {
    expect(createTranslator('de', 'de-DE').language).toBe('en');
    expect(createTranslator('de', 'de-DE').t('common.save')).toBe('Save');
  });

  it('never rejects when asked to load something unknown', async () => {
    await expect(loadLocale('xx')).resolves.toBeUndefined();
  });
});
