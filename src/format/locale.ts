import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, languageInfo, type Language } from '../i18n/languages';

export { isLanguage, type Language };

export const SUPPORTED_LANGUAGES: readonly Language[] = LANGUAGES.map((language) => language.code);

/**
 * The app language a device locale tag points to, if we have one. Chinese is
 * only offered in Simplified, so Traditional (zh-TW, zh-HK, zh-Hant) doesn't match.
 */
function languageOfTag(tag: string): Language | null {
  try {
    const locale = new Intl.Locale(tag);
    if (locale.language === 'zh') return locale.maximize().script === 'Hant' ? null : 'zh';
    return isLanguage(locale.language) ? locale.language : null;
  } catch {
    return null; // malformed tag
  }
}

/** The first device language we support, else English. */
export function detectLanguage(deviceLocales: readonly string[]): Language {
  for (const tag of deviceLocales) {
    const language = languageOfTag(tag);
    if (language) return language;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * The locale used for number and date formatting. If the device locale speaks
 * the chosen interface language (e.g. en-GB for English, es-MX for Spanish) its
 * regional habits are kept; otherwise a sensible regional default for that language is used.
 */
export function resolveLocale(language: string, deviceLocales: readonly string[]): string {
  const lang: Language = isLanguage(language) ? language : DEFAULT_LANGUAGE;
  const match = deviceLocales.find((tag) => languageOfTag(tag) === lang);
  if (match) {
    try {
      return Intl.getCanonicalLocales(match)[0] ?? languageInfo(lang).defaultLocale;
    } catch {
      /* fall through */
    }
  }
  return languageInfo(lang).defaultLocale;
}

export function deviceLocales(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
}

/** 0 = Sunday … 6 = Saturday. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const SATURDAY_FIRST = ['AE', 'AF', 'BH', 'DJ', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM', 'QA', 'SD', 'SY'];
const SUNDAY_FIRST = ['US', 'CA', 'MX', 'BR', 'JP', 'IN', 'AU', 'IL', 'KR', 'ZA', 'SA', 'PK', 'BD', 'ID', 'PH', 'TW', 'HK'];

/** First day of the week for a locale (Saturday for most of the Arab world, Sunday in the Americas, Monday in Europe…). */
export function firstDayOfWeek(locale: string): WeekDay {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info) return (info.firstDay % 7) as WeekDay; // Intl numbers Monday 1 … Sunday 7
    const region = loc.maximize().region ?? '';
    if (SATURDAY_FIRST.includes(region)) return 6;
    return SUNDAY_FIRST.includes(region) ? 0 : 1;
  } catch {
    return 1;
  }
}
