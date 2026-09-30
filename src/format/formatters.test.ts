import { describe, expect, it } from 'vitest';
import { m } from '../test/helpers';
import { createFormatter } from './bound';
import { quickAddAmounts, suggestCurrency } from './currencies';
import { detectLanguage, resolveLocale } from './locale';

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
    expect(detectLanguage(['de-DE', 'en-GB'])).toBe('en');
    expect(detectLanguage(['de-DE'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('keeps regional habits when the device matches the language, else a neutral default', () => {
    expect(resolveLocale('en', ['en-GB'])).toBe('en-GB');
    expect(resolveLocale('en', ['de-DE'])).toBe('en-US');
    expect(resolveLocale('ru', ['en-US'])).toBe('ru-RU');
  });

  it('suggests a currency from the device region', () => {
    expect(suggestCurrency(['en-US'])).toBe('USD');
    expect(suggestCurrency(['en-GB'])).toBe('GBP');
    expect(suggestCurrency(['de-DE'])).toBe('EUR');
    expect(suggestCurrency(['de-CH'])).toBe('CHF');
    expect(suggestCurrency(['ja-JP'])).toBe('JPY');
    expect(suggestCurrency(['ru'])).toBe('RUB');
    expect(suggestCurrency([])).toBe('EUR');
  });

  it('scales quick-add amounts for zero-decimal currencies', () => {
    expect(quickAddAmounts('EUR')).toEqual([5000, 10000, 25000, 50000, 100000]);
    expect(quickAddAmounts('JPY')[0]).toBe(500000);
  });
});
