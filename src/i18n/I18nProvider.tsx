import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { createFormatter, type Formatter } from '../format/bound';
import { deviceLocales, isLanguage, resolveLocale, type Language } from '../format/locale';
import { useAppSelector } from '../state/context';
import { createTranslator, type Translator } from './index';

export interface I18nValue extends Translator {
  language: Language;
  currency: string;
  fmt: Formatter;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const languageSetting = useAppSelector((s) => s.data.settings.language);
  const currency = useAppSelector((s) => s.data.settings.currency);

  const value = useMemo<I18nValue>(() => {
    const language: Language = isLanguage(languageSetting) ? languageSetting : 'en';
    const locale = resolveLocale(language, deviceLocales());
    return { ...createTranslator(language, locale), language, currency, fmt: createFormatter({ locale, currency }) };
  }, [languageSetting, currency]);

  useEffect(() => {
    document.documentElement.lang = value.language;
  }, [value.language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('I18nProvider is missing');
  return value;
}
