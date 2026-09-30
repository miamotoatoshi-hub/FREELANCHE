export const SUPPORTED_LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', ru: 'Русский' };

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** The first device language we support, else English. */
export function detectLanguage(deviceLocales: readonly string[]): Language {
  for (const tag of deviceLocales) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

const FALLBACK_LOCALE: Record<Language, string> = { en: 'en-US', ru: 'ru-RU' };

/**
 * The locale used for number and date formatting. If the device locale speaks
 * the chosen interface language (e.g. en-GB for English) its regional habits are
 * kept; otherwise a neutral default for that language is used.
 */
export function resolveLocale(language: string, deviceLocales: readonly string[]): string {
  const lang: Language = isLanguage(language) ? language : 'en';
  const match = deviceLocales.find((tag) => tag.toLowerCase().split('-')[0] === lang);
  if (match) {
    try {
      return Intl.getCanonicalLocales(match)[0] ?? FALLBACK_LOCALE[lang];
    } catch {
      /* fall through */
    }
  }
  return FALLBACK_LOCALE[lang];
}

export function deviceLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/** First day of the week for a locale: 0 = Sunday, 1 = Monday. */
export function firstDayOfWeek(locale: string): 0 | 1 {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info) return info.firstDay === 7 ? 0 : 1;
    const region = loc.maximize().region;
    return region && ['US', 'CA', 'JP', 'BR', 'MX', 'IN', 'AU', 'IL', 'KR', 'ZA'].includes(region) ? 0 : 1;
  } catch {
    return 1;
  }
}
