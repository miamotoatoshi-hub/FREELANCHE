import { describe, expect, it } from 'vitest';
import { m } from '../test/helpers';
import { createFormatter } from './bound';
import { quickAddAmounts, suggestCurrency } from './currencies';
import { detectLanguage, firstDayOfWeek, resolveLocale } from './locale';

/** Intl uses no-break / narrow no-break spaces; compare with plain ones. */
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

const en = createFormatter({ locale: 'en-US', currency: 'EUR' });
const de = createFormatter({ locale: 'de-DE', currency: 'EUR' });
const ru = createFormatter({ locale: 'ru-RU', currency: 'EUR' });

describe('money', () => {
  it('follows the locale for separators, symbol and placement', () => {
    expect(plain(en.money(m(2450.5)))).toBe('€2,450.50');
    expect(plain(de.money(m(2450.5)))).toBe('2.450,50 €');
    expect(plain(ru.money(m(2450.5)))).toBe('2 450,50 €');
  });

  it('shows cents only when there are some', () => {
    expect(en.money(m(2450))).toBe('€2,450');
    expect(en.money(m(2450.5))).toBe('€2,450.50');
    expect(en.money(m(2450.5), { fraction: 'none' })).toBe('€2,451');
    expect(en.money(m(2450), { fraction: 'always' })).toBe('€2,450.00');
  });

  it('rounds up when asked (daily targets)', () => {
    expect(en.money(m(68.75), { ceil: true, fraction: 'none' })).toBe('€69');
    expect(en.money(m(68.01), { ceil: true, fraction: 'none' })).toBe('€69');
    expect(en.money(m(68), { ceil: true, fraction: 'none' })).toBe('€68');
  });

  it('signs differences', () => {
    expect(en.money(m(500), { signed: true })).toBe('+€500');
    expect(en.money(m(-339.5), { signed: true })).toBe('-€339.50');
    expect(en.money(0, { signed: true })).toBe('€0');
  });

  it('handles zero-decimal and disambiguated currencies', () => {
    const jpy = createFormatter({ locale: 'en-US', currency: 'JPY' });
    expect(jpy.money(m(245000))).toBe('¥245,000');
    expect(createFormatter({ locale: 'en-US', currency: 'CAD' }).money(m(10))).toBe('CA$10');
    expect(createFormatter({ locale: 'en-US', currency: 'USD' }).money(m(10))).toBe('$10');
    expect(createFormatter({ locale: 'en-US', currency: 'CHF' }).money(m(10))).toContain('CHF');
  });

  it('never prints NaN or Infinity', () => {
    expect(en.money(Number.NaN)).toBe('€0');
    expect(en.money(Number.POSITIVE_INFINITY)).toBe('€0');
  });

  it('knows where the symbol goes for the amount field', () => {
    expect(en.affix).toEqual({ symbol: '€', position: 'prefix' });
    expect(de.affix).toEqual({ symbol: '€', position: 'suffix' });
    expect(en.decimalMark).toBe('.');
    expect(de.decimalMark).toBe(',');
  });
});

describe('numbers and dates', () => {
  it('formats percents and compact axis labels', () => {
    expect(en.percent(18.5, { signed: true })).toBe('+18.5%');
    expect(en.percent(-12.6, { signed: true })).toBe('-12.6%');
    expect(en.percent(20)).toBe('20%');
    expect(en.compact(m(3000))).toBe('3K');
    expect(en.compact(m(250))).toBe('250');
  });

  it('names months and days in the chosen language', () => {
    expect(en.monthYear({ year: 2026, month: 9 })).toBe('September 2026');
    expect(ru.monthYear({ year: 2026, month: 9 })).toBe('Сентябрь 2026');
    expect(en.dayMonth('2026-09-30')).toBe('September 30');
    expect(ru.dayMonth('2026-09-30')).toBe('30 сентября');
    expect(en.dayMonthYear('2025-12-31')).toBe('December 31, 2025');
  });

  it('formats a date as the same calendar day regardless of the machine time zone', () => {
    // Dates are formatted from local components at noon, so no zone can push them across midnight.
    expect(en.fullDate('2026-03-29')).toBe('Sunday, March 29, 2026'); // a DST-change day in Europe
    expect(en.fullDate('2026-01-01')).toBe('Thursday, January 1, 2026');
  });
});

describe('locale helpers', () => {
  it('picks the interface language from device languages', () => {
    expect(detectLanguage(['ru-RU', 'en-US'])).toBe('ru');
    expect(detectLanguage(['it-IT', 'en-GB'])).toBe('en'); // Italian is not offered
    expect(detectLanguage(['it-IT'])).toBe('en');
    expect(detectLanguage(['de-AT', 'en-GB'])).toBe('de');
    expect(detectLanguage(['ko-KR'])).toBe('ko');
    expect(detectLanguage([])).toBe('en');
    expect(detectLanguage(['ja-JP'])).toBe('ja');
    expect(detectLanguage(['ar-EG'])).toBe('ar');
    expect(detectLanguage(['pt-PT'])).toBe('pt');
    expect(detectLanguage(['in-ID'])).toBe('id'); // legacy Indonesian code
    expect(detectLanguage(['zh-Hans-CN'])).toBe('zh');
    expect(detectLanguage(['zh'])).toBe('zh');
    expect(detectLanguage(['zh-TW', 'fr-FR'])).toBe('fr'); // Traditional Chinese is not offered
    expect(detectLanguage(['not a locale', 'es-MX'])).toBe('es');
  });

  it('keeps regional habits when the device matches the language, else a regional default', () => {
    expect(resolveLocale('en', ['en-GB'])).toBe('en-GB');
    expect(resolveLocale('en', ['de-DE'])).toBe('en-US');
    expect(resolveLocale('ru', ['en-US'])).toBe('ru-RU');
    expect(resolveLocale('es', ['es-MX', 'en-US'])).toBe('es-MX');
    expect(resolveLocale('ar', ['en-US'])).toBe('ar');
    expect(resolveLocale('bn', ['en-US'])).toBe('bn-BD');
    expect(resolveLocale('xx', [])).toBe('en-US');
  });

  it('suggests a currency from the device region — and only suggests', () => {
    expect(suggestCurrency(['en-US'])).toBe('USD');
    expect(suggestCurrency(['en-GB'])).toBe('GBP');
    expect(suggestCurrency(['de-DE'])).toBe('EUR');
    expect(suggestCurrency(['de-CH'])).toBe('CHF');
    expect(suggestCurrency(['ja-JP'])).toBe('JPY');
    expect(suggestCurrency(['ru'])).toBe('RUB');
    expect(suggestCurrency(['bn'])).toBe('BDT');
    expect(suggestCurrency(['ur'])).toBe('PKR');
    expect(suggestCurrency(['id'])).toBe('IDR');
    expect(suggestCurrency([])).toBeNull(); // nothing to suggest is fine: the person picks
  });

  it('scales quick-add amounts to how big amounts are in each currency', () => {
    expect(quickAddAmounts('EUR')).toEqual([5000, 10000, 25000, 50000, 100000]);
    expect(quickAddAmounts('JPY')[0]).toBe(500000);
    expect(quickAddAmounts('RUB')[0]).toBe(500000);
    expect(quickAddAmounts('IDR')[0]).toBe(5000000);
  });

  it('knows which day the week starts on', () => {
    expect(firstDayOfWeek('en-US')).toBe(0);
    expect(firstDayOfWeek('de-DE')).toBe(1);
    expect(firstDayOfWeek('ar')).toBe(6); // Saturday
    expect(firstDayOfWeek('ar-EG')).toBe(6);
    expect(firstDayOfWeek('fr-FR')).toBe(1);
  });
});

describe('every supported language formats money, dates and numbers', () => {
  const locales: Record<string, string> = {
    en: 'en-US', zh: 'zh-CN', hi: 'hi-IN', es: 'es-ES', fr: 'fr-FR', ar: 'ar', bn: 'bn-BD', pt: 'pt-BR', ru: 'ru-RU', ur: 'ur-PK', id: 'id-ID', ja: 'ja-JP', de: 'de-DE', ko: 'ko-KR',
  };

  it.each(Object.entries(locales))('%s (%s)', (_code, locale) => {
    const f = createFormatter({ locale, currency: 'EUR' });
    expect(f.money(m(2450.5))).toMatch(/\p{Nd}/u);
    expect(f.money(m(2450.5)).length).toBeGreaterThan(4);
    expect(f.monthYear({ year: 2026, month: 9 })).toMatch(/2026|٢٠٢٦|২০২৬/);
    expect(f.fullDate('2026-09-30')).not.toBe('');
    expect(f.percent(78)).toMatch(/\p{Nd}/u);
    expect(f.decimalMark).not.toBe('');
    expect(f.affix.symbol).not.toBe('');
  });

  it('always uses the Gregorian calendar, even for locales that default to another', () => {
    expect(createFormatter({ locale: 'ar-SA', currency: 'SAR' }).monthYear({ year: 2026, month: 9 })).toMatch(/2026|٢٠٢٦/);
    expect(createFormatter({ locale: 'th-TH', currency: 'THB' }).fullDate('2026-09-30')).toMatch(/2026|๒๐๒๖/);
  });

  it('writes numbers in each locale’s grouping and digits', () => {
    expect(createFormatter({ locale: 'hi-IN', currency: 'INR' }).money(m(1234567))).toBe('₹12,34,567');
    expect(createFormatter({ locale: 'bn-BD', currency: 'BDT' }).money(m(2450))).toMatch(/২,৪৫০/);
    expect(plain(createFormatter({ locale: 'ru-RU', currency: 'RUB' }).money(m(200000)))).toBe('200 000 ₽');
    expect(plain(createFormatter({ locale: 'en-US', currency: 'RUB' }).money(m(200000)))).toBe('RUB 200,000');
    expect(createFormatter({ locale: 'en-US', currency: 'EUR' }).money(m(2000))).toBe('€2,000');
    expect(createFormatter({ locale: 'en-US', currency: 'USD' }).money(m(2000))).toBe('$2,000');
    expect(createFormatter({ locale: 'zh-CN', currency: 'CNY' }).money(m(2000))).toBe('¥2,000');
    expect(createFormatter({ locale: 'pt-BR', currency: 'BRL' }).money(m(2000))).toMatch(/R\$\s?2\.000/);
  });
});
