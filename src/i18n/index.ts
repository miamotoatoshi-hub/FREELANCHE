import { en, type MessageKey, type PluralBase } from './locales/en';
import { directionOf, isLanguage, type Direction, type Language } from './languages';
import { getDictionary } from './registry';

export type { MessageKey, PluralBase };
export type Params = Record<string, string | number>;

export interface Translator {
  language: Language;
  locale: string;
  dir: Direction;
  t: (key: MessageKey, params?: Params) => string;
  /** Picks the right plural form for `count` (`count` is also available as {count}). */
  tn: (base: PluralBase, count: number, params?: Params) => string;
}

/** First Strong Isolate / Pop Directional Isolate: keeps an inserted value from reordering the sentence around it. */
const FSI = '⁨';
const PDI = '⁩';

interface InterpolationContext {
  numbers: Intl.NumberFormat;
  /** In right-to-left text every inserted value is isolated; in left-to-right only names (which may be in any script). */
  isolateAll: boolean;
}

function interpolate(template: string, params: Params | undefined, context: InterpolationContext): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const raw = params[name]!;
    // Numbers are written with the locale's own digits and grouping; strings (money, dates) are already formatted.
    const text = typeof raw === 'number' ? context.numbers.format(raw) : raw;
    return context.isolateAll || name === 'name' ? `${FSI}${text}${PDI}` : text;
  });
}

/**
 * Builds the `t` / `tn` functions for a language. Any key missing from the
 * language falls back to English, then to the key itself — never a blank or a crash.
 */
export function createTranslator(language: string, locale: string): Translator {
  const lang: Language = isLanguage(language) ? language : 'en';
  const dir = directionOf(lang);
  const dictionary = getDictionary(lang) ?? {};

  let rules: Intl.PluralRules;
  let numbers: Intl.NumberFormat;
  try {
    rules = new Intl.PluralRules(locale);
    numbers = new Intl.NumberFormat(locale);
  } catch {
    rules = new Intl.PluralRules('en');
    numbers = new Intl.NumberFormat('en');
  }
  const context: InterpolationContext = { numbers, isolateAll: dir === 'rtl' };

  const lookup = (key: string): string => dictionary[key] ?? (en as Record<string, string>)[key] ?? key;

  return {
    language: lang,
    locale,
    dir,
    t: (key, params) => interpolate(lookup(key), params, context),
    tn: (base, count, params) => {
      const key = `${base}.${rules.select(count)}`;
      const template = dictionary[key] ?? (en as Record<string, string>)[key] ?? lookup(`${base}.other`);
      return interpolate(template, { count, ...params }, context);
    },
  };
}
