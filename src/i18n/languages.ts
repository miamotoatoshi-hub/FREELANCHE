/**
 * The languages the app speaks. Pure data — to add a language:
 *   1. add an entry here,
 *   2. add `locales/<code>.ts` exporting a dictionary with every key of `locales/en.ts`,
 *   3. register its loader in `registry.ts`.
 * The completeness test fails until all three are done.
 */

export type Direction = 'ltr' | 'rtl';

export interface LanguageInfo {
  /** Interface language code, also the key stored in settings. */
  code: string;
  /** The language's name written in its own script — what people look for in a list. */
  nativeName: string;
  englishName: string;
  dir: Direction;
  /**
   * Regional locale used for numbers and dates when the device doesn't already
   * speak this language (a device set to es-MX keeps es-MX).
   */
  defaultLocale: string;
}

export const LANGUAGES = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', defaultLocale: 'en-US' },
  { code: 'zh', nativeName: '中文 (简体)', englishName: 'Chinese (Simplified)', dir: 'ltr', defaultLocale: 'zh-CN' },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi', dir: 'ltr', defaultLocale: 'hi-IN' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', defaultLocale: 'es-ES' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', defaultLocale: 'fr-FR' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', defaultLocale: 'de-DE' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', defaultLocale: 'ar' },
  { code: 'bn', nativeName: 'বাংলা', englishName: 'Bengali', dir: 'ltr', defaultLocale: 'bn-BD' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', defaultLocale: 'pt-BR' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian', dir: 'ltr', defaultLocale: 'ru-RU' },
  { code: 'ur', nativeName: 'اردو', englishName: 'Urdu', dir: 'rtl', defaultLocale: 'ur-PK' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian', dir: 'ltr', defaultLocale: 'id-ID' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', defaultLocale: 'ja-JP' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', dir: 'ltr', defaultLocale: 'ko-KR' },
] as const satisfies readonly LanguageInfo[];

export type Language = (typeof LANGUAGES)[number]['code'];

export const LANGUAGE_CODES: readonly Language[] = LANGUAGES.map((language) => language.code);

export const DEFAULT_LANGUAGE: Language = 'en';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGE_CODES as readonly string[]).includes(value);
}

export function languageInfo(code: string): LanguageInfo {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0];
}

export const directionOf = (code: string): Direction => languageInfo(code).dir;
