/** The seven currencies shown up front; everything else sits behind "More currencies". */
export const PRIMARY_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY'] as const;

export const MORE_CURRENCIES = [
  'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'RUB', 'UAH', 'TRY', 'CNY', 'HKD', 'SGD', 'KRW', 'INR', 'BRL', 'MXN', 'ZAR', 'AED',
] as const;

export const ALL_CURRENCIES: readonly string[] = [...PRIMARY_CURRENCIES, ...MORE_CURRENCIES];

const EURO_REGIONS = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];

const REGION_CURRENCY: Record<string, string> = {
  US: 'USD', GB: 'GBP', CH: 'CHF', LI: 'CHF', CA: 'CAD', AU: 'AUD', JP: 'JPY', NZ: 'NZD',
  SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', RU: 'RUB', UA: 'UAH', TR: 'TRY',
  CN: 'CNY', HK: 'HKD', SG: 'SGD', KR: 'KRW', IN: 'INR', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', AE: 'AED',
  ...Object.fromEntries(EURO_REGIONS.map((region) => [region, 'EUR'])),
};

/** A sensible starting currency for the device's locale. The user can always change it. */
export function suggestCurrency(deviceLocales: readonly string[]): string {
  for (const tag of deviceLocales) {
    try {
      const region = new Intl.Locale(tag).maximize().region;
      const currency = region ? REGION_CURRENCY[region] : undefined;
      if (currency) return currency;
    } catch {
      /* ignore malformed tags */
    }
  }
  return 'EUR';
}

const displayNames = new Map<string, Intl.DisplayNames | null>();

/** "Euro", "US Dollar", … in the interface language. */
export function currencyName(code: string, locale: string): string {
  let names = displayNames.get(locale);
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames([locale], { type: 'currency' });
    } catch {
      names = null;
    }
    displayNames.set(locale, names);
  }
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function currencySymbol(code: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'symbol' }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

/** Quick-add buttons in the add-income sheet, as stored amounts. Zero-decimal currencies get bigger steps. */
export function quickAddAmounts(currency: string): number[] {
  const scale = currency === 'JPY' || currency === 'KRW' ? 100 : 1;
  return [50, 100, 250, 500, 1000].map((major) => major * scale * 100);
}

/** Suggested monthly goals in onboarding, as stored amounts. */
export function goalPresets(currency: string): number[] {
  const scale = currency === 'JPY' || currency === 'KRW' ? 100 : 1;
  return [1000, 2000, 3000, 5000, 10000].map((major) => major * scale * 100);
}
