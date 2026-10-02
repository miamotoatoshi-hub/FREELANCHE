import { en } from './locales/en';
import { isLanguage, type Language } from './languages';

export type Dictionary = Record<string, string>;

/**
 * Each language is its own module, fetched only when someone uses it (English is
 * always bundled and is the fallback for any key a language lacks). Every chunk
 * is precached by the service worker, so switching language works offline too.
 */
const loaders: Record<Exclude<Language, 'en'>, () => Promise<Dictionary>> = {
  zh: () => import('./locales/zh').then((m) => m.zh),
  hi: () => import('./locales/hi').then((m) => m.hi),
  es: () => import('./locales/es').then((m) => m.es),
  fr: () => import('./locales/fr').then((m) => m.fr),
  de: () => import('./locales/de').then((m) => m.de),
  ar: () => import('./locales/ar').then((m) => m.ar),
  bn: () => import('./locales/bn').then((m) => m.bn),
  pt: () => import('./locales/pt').then((m) => m.pt),
  ru: () => import('./locales/ru').then((m) => m.ru),
  ur: () => import('./locales/ur').then((m) => m.ur),
  id: () => import('./locales/id').then((m) => m.id),
  ja: () => import('./locales/ja').then((m) => m.ja),
  ko: () => import('./locales/ko').then((m) => m.ko),
};

const loaded = new Map<string, Dictionary>([['en', en]]);
const pending = new Map<string, Promise<void>>();

export const isLocaleLoaded = (code: string): boolean => loaded.has(code);

export const getDictionary = (code: string): Dictionary | undefined => loaded.get(code);

/**
 * Makes a language available. Never rejects: if a chunk can't be fetched the app
 * keeps working in English rather than breaking.
 */
export function loadLocale(code: string): Promise<void> {
  if (!isLanguage(code) || loaded.has(code)) return Promise.resolve();
  const existing = pending.get(code);
  if (existing) return existing;

  const promise = loaders[code as Exclude<Language, 'en'>]()
    .then((dictionary) => {
      loaded.set(code, dictionary);
    })
    .catch((error: unknown) => {
      console.warn(`Could not load the "${code}" translations; using English.`, error);
    })
    .finally(() => {
      pending.delete(code);
    });
  pending.set(code, promise);
  return promise;
}

/** Test/SSR helper: registers a dictionary directly. */
export function registerLocale(code: string, dictionary: Dictionary): void {
  loaded.set(code, dictionary);
}
