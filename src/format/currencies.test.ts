import { describe, expect, it } from 'vitest';
import {
  ALL_CURRENCIES,
  currencyMagnitude,
  currencyName,
  currencySymbol,
  exampleGoal,
  goalPresets,
  POPULAR_CURRENCIES,
  searchCurrencies,
} from './currencies';

describe('the currency catalogue', () => {
  it('has a comprehensive list of real, unique ISO currencies', () => {
    const supported = new Set(Intl.supportedValuesOf('currency'));
    expect(ALL_CURRENCIES.length).toBeGreaterThan(100);
    expect(new Set(ALL_CURRENCIES).size).toBe(ALL_CURRENCIES.length);
    expect(ALL_CURRENCIES.filter((code) => !supported.has(code))).toEqual([]);
  });

  it('includes every currency the brief names, and puts the popular ones first', () => {
    for (const code of ['EUR', 'USD', 'RUB', 'CNY', 'JPY', 'INR', 'GBP', 'BRL', 'CHF', 'CAD', 'AUD', 'MXN', 'TRY', 'KRW', 'IDR', 'PKR', 'BDT', 'EGP', 'SAR', 'AED']) {
      expect(ALL_CURRENCIES, code).toContain(code);
    }
    expect(searchCurrencies('', 'en-US').slice(0, POPULAR_CURRENCIES.length)).toEqual([...POPULAR_CURRENCIES]);
  });

  it('lists everything exactly once when not searching', () => {
    const all = searchCurrencies('', 'en-US');
    expect([...all].sort()).toEqual([...ALL_CURRENCIES].sort());
  });

  it('shows names and symbols in the interface language', () => {
    expect(currencyName('EUR', 'en-US')).toBe('Euro');
    expect(currencyName('RUB', 'ru-RU')).toMatch(/рубль/i);
    expect(currencyName('EUR', 'zh-CN')).toBe('欧元');
    expect(currencyName('JPY', 'ja-JP')).toBe('日本円');
    expect(currencyName('USD', 'ar')).toMatch(/[\u0600-\u06ff]/);
    expect(currencySymbol('EUR', 'en-US')).toBe('€');
    expect(currencySymbol('RUB', 'ru-RU')).toBe('₽');
    expect(currencySymbol('INR', 'en-US')).toBe('₹');
    expect(currencySymbol('BRL', 'pt-BR')).toBe('R$');
  });
});

describe('searchCurrencies', () => {
  it('finds by code, name and symbol', () => {
    expect(searchCurrencies('eur', 'en-US')[0]).toBe('EUR');
    expect(searchCurrencies('euro', 'en-US')[0]).toBe('EUR');
    expect(searchCurrencies('rub', 'en-US')[0]).toBe('RUB');
    expect(searchCurrencies('₽', 'en-US')[0]).toBe('RUB'); // the symbol works whatever the UI language
    expect(searchCurrencies('₽', 'ar')[0]).toBe('RUB');
    expect(searchCurrencies('₹', 'en-US')[0]).toBe('INR');
    expect(searchCurrencies('yen', 'en-US')).toContain('JPY');
    expect(searchCurrencies('yuan', 'en-US')).toContain('CNY');
    expect(searchCurrencies('real', 'en-US')).toContain('BRL');
  });

  it('matches several words and ignores case and accents', () => {
    expect(searchCurrencies('US DOLLAR', 'en-US')[0]).toBe('USD');
    expect(searchCurrencies('  swiss   franc ', 'en-US')[0]).toBe('CHF');
    expect(searchCurrencies('british pound', 'en-US')[0]).toBe('GBP');
    expect(searchCurrencies('sterling', 'en-US')[0]).toBe('GBP');
    expect(searchCurrencies('renminbi', 'en-US')[0]).toBe('CNY');
    expect(searchCurrencies('PESO', 'en-US').length).toBeGreaterThan(3);
  });

  it('searches in the interface language and in English', () => {
    expect(searchCurrencies('рубль', 'ru-RU')[0]).toBe('RUB');
    expect(searchCurrencies('юань', 'ru-RU')[0]).toBe('CNY');
    expect(searchCurrencies('欧元', 'zh-CN')[0]).toBe('EUR');
    expect(searchCurrencies('円', 'ja-JP')[0]).toBe('JPY');
    expect(searchCurrencies('دولار', 'ar')).toContain('USD');
    expect(searchCurrencies('euro', 'ru-RU')[0]).toBe('EUR'); // English names always work
    expect(searchCurrencies('rupia', 'id-ID')).toContain('IDR');
  });

  it('ranks exact matches first and returns nothing for nonsense', () => {
    expect(searchCurrencies('usd', 'en-US')[0]).toBe('USD');
    expect(searchCurrencies('xyzzy', 'en-US')).toEqual([]);
  });
});

describe('sensible example amounts', () => {
  it('sizes the goal example to the currency: €2,000 · ₽200,000', () => {
    expect(exampleGoal('EUR')).toBe(200000);
    expect(exampleGoal('USD')).toBe(200000);
    expect(exampleGoal('RUB')).toBe(20000000);
    expect(exampleGoal('JPY')).toBe(20000000);
    expect(exampleGoal('IDR')).toBe(200000000);
    expect(goalPresets('RUB')).toEqual([10000000, 20000000, 30000000, 50000000, 100000000]);
  });

  it('is a layout hint only: every magnitude is a power of ten', () => {
    for (const code of ALL_CURRENCIES) expect([1, 10, 100, 1000]).toContain(currencyMagnitude(code));
  });
});
