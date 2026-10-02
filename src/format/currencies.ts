import { STORAGE_SCALE } from '../domain/money';

/**
 * The world's commonly used currencies (ISO 4217). Names and symbols come from
 * `Intl`, so they appear in the user's own language. Nothing here converts money:
 * there are no exchange rates in this app.
 */

/** Shown first in the picker. */
export const POPULAR_CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CNY', 'INR', 'RUB', 'BRL', 'CHF', 'CAD', 'AUD'] as const;

const OTHER_CURRENCIES = [
  'AED', 'AFN', 'ALL', 'AMD', 'ARS', 'AZN', 'BAM', 'BDT', 'BGN', 'BHD', 'BWP', 'BYN', 'CLP', 'COP', 'CRC', 'CZK', 'DKK',
  'DOP', 'DZD', 'EGP', 'ETB', 'GEL', 'GHS', 'GTQ', 'HKD', 'HNL', 'HUF', 'IDR', 'ILS', 'IQD', 'IRR', 'ISK', 'JMD', 'JOD',
  'KES', 'KGS', 'KHR', 'KRW', 'KWD', 'KZT', 'LAK', 'LBP', 'LKR', 'MAD', 'MDL', 'MKD', 'MMK', 'MNT', 'MOP', 'MUR', 'MXN',
  'MYR', 'MZN', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR', 'PAB', 'PEN', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD',
  'RWF', 'SAR', 'SEK', 'SGD', 'THB', 'TJS', 'TND', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'UYU', 'UZS', 'VES', 'VND',
  'XAF', 'XOF', 'YER', 'ZAR', 'ZMW',
] as const;

export const ALL_CURRENCIES: readonly string[] = [...POPULAR_CURRENCIES, ...OTHER_CURRENCIES];

const EURO_REGIONS = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CH: 'CHF', LI: 'CHF', CA: 'CAD', AU: 'AUD', JP: 'JPY', NZ: 'NZD',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', RU: 'RUB', UA: 'UAH', TR: 'TRY',
  CN: 'CNY', HK: 'HKD', SG: 'SGD', KR: 'KRW', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', AE: 'AED',
  ID: 'IDR', PK: 'PKR', BD: 'BDT', EG: 'EGP', SA: 'SAR', VN: 'VND', TH: 'THB', PH: 'PHP', MY: 'MYR',
  NG: 'NGN', KE: 'KES', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', IL: 'ILS', HU: 'HUF', RO: 'RON',
  BG: 'BGN', TW: 'TWD', KZ: 'KZT', MA: 'MAD', DZ: 'DZD', QA: 'QAR', KW: 'KWD', LK: 'LKR', NP: 'NPR',
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, 'EUR'])),
};

/**
 * A currency to *suggest* from the device locale. It is only ever offered, never
 * pre-selected: the person picks their own currency in onboarding.
 */
export function suggestCurrency(deviceLocales: readonly string[]): string | null {
  for (const tag of deviceLocales) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      const currency = region ? REGION_CURRENCY[region] : undefined;
      if (currency) return currency;
    } catch {
      /* ignore malformed tags */
    }
  }
  return null;
}

// ── names & symbols ──────────────────────────────────────────────────────────

const displayNames = new Map<string, Intl.DisplayNames | null>();

function namesFor(locale: string): Intl.DisplayNames | null {
  let names = displayNames.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: 'currency' });
    } catch {
      names = null;
    }
    displayNames.set(locale, names);
  }
  return names;
}

const nameCache = new Map<string, string>();
const symbolCache = new Map<string, string>();
const narrowCache = new Map<string, string>();

/** Other names people type for a currency, in English (the app always searches English names too). */
const ALIASES: Record<string, string> = {
  GBP: 'sterling quid',
  CNY: 'renminbi rmb',
  RUB: 'rouble',
  BRL: 'reais',
  USD: 'greenback buck',
  MXN: 'pesos',
};

/** The compact symbol for a currency (₽, ₹, $, ¥ …), whatever language the app is in. */
function narrowSymbol(code: string): string {
  let symbol = narrowCache.get(code);
  if (symbol === undefined) {
    try {
      const parts = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      symbol = parts.find((part) => part.type === 'currency')?.value ?? code;
    } catch {
      symbol = code;
    }
    narrowCache.set(code, symbol);
  }
  return symbol;
}

/** "Euro", "US Dollar", "Евро", "欧元", "ين ياباني" … in the given locale. */
export function currencyName(code: string, locale: string): string {
  const key = `${locale}|${code}`;
  let name = nameCache.get(key);
  if (name === undefined) {
    try {
      name = namesFor(locale)?.of(code) ?? code;
    } catch {
      name = code;
    }
    nameCache.set(key, name);
  }
  return name;
}

export function currencySymbol(code: string, locale: string): string {
  const key = `${locale}|${code}`;
  let symbol = symbolCache.get(key);
  if (symbol === undefined) {
    try {
      const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'symbol' }).formatToParts(0);
      symbol = parts.find((part) => part.type === 'currency')?.value ?? code;
    } catch {
      symbol = code;
    }
    symbolCache.set(key, symbol);
  }
  return symbol;
}

// ── search ───────────────────────────────────────────────────────────────────

/** Lower-cases and strips accents, so "peso" finds "Peso" and "franc" finds "Franç". */
function fold(text: string, locale: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale).trim();
}

/**
 * Currencies matching a search, best matches first. Looks at the code, the name
 * in the interface language, the English name and the symbol — every word typed
 * must match. With no query: popular currencies first, then everything A–Z by name.
 */
export function searchCurrencies(query: string, locale: string): string[] {
  const text = fold(query, locale);
  if (text === '') {
    const rest = ALL_CURRENCIES.filter((code) => !(POPULAR_CURRENCIES as readonly string[]).includes(code));
    const byName = [...rest].sort((a, b) => currencyName(a, locale).localeCompare(currencyName(b, locale), locale));
    return [...POPULAR_CURRENCIES, ...byName];
  }

  const words = text.split(/\s+/);
  const scored: { code: string; score: number; name: string }[] = [];
  for (const code of ALL_CURRENCIES) {
    const local = fold(currencyName(code, locale), locale);
    const english = fold(currencyName(code, 'en'), 'en');
    const symbol = fold(currencySymbol(code, locale), locale);
    const narrow = fold(narrowSymbol(code), locale);
    const haystack = [fold(code, 'en'), local, english, symbol, narrow, ALIASES[code] ?? ''];
    if (!words.every((word) => haystack.some((field) => field.includes(word)))) continue;

    const lowerCode = code.toLowerCase();
    const firstWord = words[0]!;
    const startsWord = (name: string) => name.split(/\s+/).some((word) => word.startsWith(firstWord));
    let score: number;
    if (text === lowerCode || text === symbol || text === narrow) score = 0;
    else if (lowerCode.startsWith(text) || local.startsWith(text) || english.startsWith(text)) score = 1;
    else if (startsWord(local) || startsWord(english)) score = 2;
    else score = 3;
    scored.push({ code, score, name: currencyName(code, locale) });
  }
  const popularRank = (code: string) => {
    const index = (POPULAR_CURRENCIES as readonly string[]).indexOf(code);
    return index === -1 ? 99 : index;
  };
  return scored
    .sort((a, b) => a.score - b.score || popularRank(a.code) - popularRank(b.code) || a.name.localeCompare(b.name, locale))
    .map((item) => item.code);
}

// ── sensible button sizes ────────────────────────────────────────────────────

const MAGNITUDE_1000 = ['KRW', 'VND', 'IDR', 'IRR', 'LBP', 'LAK', 'MMK', 'COP', 'CLP', 'PYG', 'UZS', 'IQD', 'KHR', 'UGX', 'TZS', 'MNT'];
const MAGNITUDE_100 = [
  'JPY', 'INR', 'RUB', 'KZT', 'PKR', 'BDT', 'NGN', 'LKR', 'HUF', 'ISK', 'KES', 'XAF', 'XOF', 'RWF', 'AMD', 'DZD', 'ETB', 'CRC', 'ARS',
  'NPR', 'RSD', 'ALL', 'KGS', 'JMD', 'VES', 'AFN', 'YER',
];
const MAGNITUDE_10 = [
  'CNY', 'HKD', 'MXN', 'CZK', 'SEK', 'NOK', 'DKK', 'TRY', 'THB', 'PHP', 'UAH', 'TWD', 'ZAR', 'EGP', 'MAD', 'BWP', 'MUR', 'MDL',
  'DOP', 'UYU', 'NIO', 'HNL', 'MKD', 'TJS', 'MOP', 'GHS', 'MZN', 'ZMW', 'TTD',
];

/**
 * How many zeros typical amounts carry in this currency (1, 10, 100 or 1,000×).
 * Used only to size suggestion buttons — a ₽ goal reads "200,000", a € goal "2,000".
 * It is a layout hint, not an exchange rate, and is never applied to stored money.
 */
export function currencyMagnitude(code: string): 1 | 10 | 100 | 1000 {
  if (MAGNITUDE_1000.includes(code)) return 1000;
  if (MAGNITUDE_100.includes(code)) return 100;
  if (MAGNITUDE_10.includes(code)) return 10;
  return 1;
}

const scaled = (majors: number[], code: string) => majors.map((major) => major * currencyMagnitude(code) * STORAGE_SCALE);

/** Quick-add buttons in the add-income sheet, as stored amounts. */
export const quickAddAmounts = (code: string): number[] => scaled([50, 100, 250, 500, 1000], code);

/** Suggested monthly goals in onboarding, as stored amounts. */
export const goalPresets = (code: string): number[] => scaled([1000, 2000, 3000, 5000, 10000], code);

/** The faint example shown in an empty goal field, as a stored amount (2,000 € · 200,000 ₽). */
export const exampleGoal = (code: string): number => scaled([2000], code)[0]!;
