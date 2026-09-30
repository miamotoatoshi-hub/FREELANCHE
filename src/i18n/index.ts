import { en, type MessageKey, type PluralBase } from './en';
import { ru } from './ru';
import { isLanguage, type Language } from '../format/locale';

export type { MessageKey, PluralBase };
export type Params = Record<string, string | number>;

const dictionaries: Record<Language, Record<string, string>> = { en, ru };

export interface Translator {
  language: Language;
  locale: string;
  t: (key: MessageKey, params?: Params) => string;
  /** Picks the right plural form for `count` (`count` is also available as {count}). */
  tn: (base: PluralBase, count: number, params?: Params) => string;
}

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function createTranslator(language: string, locale: string): Translator {
  const lang: Language = isLanguage(language) ? language : 'en';
  const dictionary = dictionaries[lang];
  const rules = new Intl.PluralRules(locale);

  const lookup = (key: string): string => dictionary[key] ?? en[key as MessageKey] ?? key;

  return {
    language: lang,
    locale,
    t: (key, params) => interpolate(lookup(key), params),
    tn: (base, count, params) => {
      const category = rules.select(count);
      const key = `${base}.${category}`;
      const template = key in dictionary ? dictionary[key]! : lookup(`${base}.other`);
      return interpolate(template, { count, ...params });
    },
  };
}
