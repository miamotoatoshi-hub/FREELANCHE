import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { createTranslator } from './index';

describe('dictionaries', () => {
  it('Russian defines every English key, and no key is empty', () => {
    const missing = Object.keys(en).filter((key) => !(key in ru));
    expect(missing).toEqual([]);
    for (const dictionary of [en, ru] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(dictionary)) expect(value.trim(), key).not.toBe('');
    }
  });

  it('uses the same placeholders in both languages', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const [key, value] of Object.entries(en)) {
      expect(placeholders(ru[key]!), key).toBe(placeholders(value));
    }
  });

  it('every English plural has its `one` and `other` forms; Russian also has few and many', () => {
    const bases = Object.keys(en).filter((key) => key.endsWith('.other')).map((key) => key.slice(0, -6));
    expect(bases.length).toBeGreaterThan(3);
    for (const base of bases) {
      expect(en, base).toHaveProperty([`${base}.one`]);
      for (const form of ['one', 'few', 'many', 'other']) expect(ru, `${base}.${form}`).toHaveProperty([`${base}.${form}`]);
    }
  });
});

describe('createTranslator', () => {
  it('interpolates placeholders and leaves unknown ones visible', () => {
    const { t } = createTranslator('en', 'en-US');
    expect(t('home.left', { amount: '€550' })).toBe('€550 left');
    expect(t('home.left')).toBe('{amount} left');
  });

  it('chooses English plural forms', () => {
    const { tn } = createTranslator('en', 'en-US');
    expect(tn('insights.streak.value', 1)).toBe('1 day');
    expect(tn('insights.streak.value', 3)).toBe('3 days');
  });

  it('chooses Russian plural forms', () => {
    const { tn } = createTranslator('ru', 'ru-RU');
    expect(tn('insights.streak.value', 1)).toBe('1 день');
    expect(tn('insights.streak.value', 3)).toBe('3 дня');
    expect(tn('insights.streak.value', 5)).toBe('5 дней');
    expect(tn('insights.streak.value', 21)).toBe('21 день');
    expect(tn('insights.streak.value', 11)).toBe('11 дней');
  });

  it('falls back to English for unsupported languages', () => {
    expect(createTranslator('de', 'de-DE').language).toBe('en');
  });
});
