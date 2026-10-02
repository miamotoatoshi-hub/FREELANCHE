import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANG_KEY } from '../data/persistence';
import { createFormatter, type Formatter } from '../format/bound';
import { deviceLocales, resolveLocale } from '../format/locale';
import { useAppSelector } from '../state/context';
import { createTranslator, type Translator } from './index';
import { DEFAULT_LANGUAGE, isLanguage, type Language } from './languages';
import { isLocaleLoaded, loadLocale } from './registry';

export interface I18nValue extends Translator {
  language: Language;
  currency: string;
  fmt: Formatter;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const languageSetting = useAppSelector((s) => s.data.settings.language);
  const currency = useAppSelector((s) => s.data.settings.currency);
  const language: Language = isLanguage(languageSetting) ? languageSetting : DEFAULT_LANGUAGE;

  // The saved language is loaded before the first render (see main.tsx). This covers the other
  // ways a language can change under us — e.g. another tab switched it.
  const [loadedCount, setLoadedCount] = useState(0);
  useEffect(() => {
    if (isLocaleLoaded(language)) return;
    let cancelled = false;
    void loadLocale(language).then(() => {
      if (!cancelled) setLoadedCount((count) => count + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const value = useMemo<I18nValue>(() => {
    const locale = resolveLocale(language, deviceLocales());
    return { ...createTranslator(language, locale), language, currency, fmt: createFormatter({ locale, currency }) };
    // `loadedCount` re-derives the translator once a late-loading dictionary arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, currency, loadedCount]);

  // Text direction and language drive layout, fonts and screen-reader pronunciation.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = value.locale;
    root.dir = value.dir;
    try {
      window.localStorage.setItem(LANG_KEY, language);
    } catch {
      /* storage unavailable — the saved settings still hold the choice */
    }
  }, [value.locale, value.dir, language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
