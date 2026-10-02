import { useId } from 'react';
import { LANGUAGES } from '../../i18n/languages';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface LanguageSelectorProps {
  value: string;
  onSelect: (code: string) => void;
}

/**
 * Every language written in its own script (so you can find yours even if the
 * current language is unreadable to you), with the English name beneath. Native
 * radio inputs give correct screen-reader and arrow-key behaviour.
 */
export function LanguageSelector({ value, onSelect }: LanguageSelectorProps) {
  const { t } = useI18n();
  const group = useId();
  return (
    <fieldset className="languages">
      <legend className="sr-only">{t('language.list')}</legend>
      {LANGUAGES.map((language) => {
        const selected = language.code === value;
        return (
          <label key={language.code} className={`language${selected ? ' is-selected' : ''}`}>
            <input
              className="sr-only"
              type="radio"
              name={group}
              value={language.code}
              checked={selected}
              onChange={() => onSelect(language.code)}
            />
            <span className="language__text">
              {/* lang + dir let each name use its own script's font and direction, whatever the app language is. */}
              <span className="language__native" lang={language.code} dir={language.dir}>
                {language.nativeName}
              </span>
              {language.nativeName !== language.englishName && <span className="language__english">{language.englishName}</span>}
            </span>
            {selected ? <Icon name="check" className="language__check" /> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
