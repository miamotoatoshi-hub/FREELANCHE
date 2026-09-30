import { useId, useState } from 'react';
import { ALL_CURRENCIES, currencyName, currencySymbol, PRIMARY_CURRENCIES } from '../../format/currencies';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface CurrencySelectorProps {
  value: string;
  onSelect: (currency: string) => void;
}

/**
 * The seven main currencies up front, the rest one tap away. Native radio inputs
 * give correct screen-reader and arrow-key behaviour for free.
 */
export function CurrencySelector({ value, onSelect }: CurrencySelectorProps) {
  const { t, locale } = useI18n();
  const group = useId();
  const [expanded, setExpanded] = useState(() => !(PRIMARY_CURRENCIES as readonly string[]).includes(value));
  const list = expanded ? ALL_CURRENCIES : PRIMARY_CURRENCIES;

  return (
    <div className="currencies">
      <fieldset className="currencies__list">
        <legend className="sr-only">{t('currency.list')}</legend>
        {list.map((code) => (
          <label key={code} className={`currency${code === value ? ' is-selected' : ''}`}>
            <input
              className="sr-only"
              type="radio"
              name={group}
              value={code}
              checked={code === value}
              onChange={() => onSelect(code)}
            />
            <span className="currency__symbol" aria-hidden="true">
              {currencySymbol(code, locale)}
            </span>
            <span className="currency__text">
              <span className="currency__name">{currencyName(code, locale)}</span>
              <span className="currency__code">{code}</span>
            </span>
            {code === value ? <Icon name="check" className="currency__check" /> : null}
          </label>
        ))}
      </fieldset>
      <button type="button" className="link-btn" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded}>
        {expanded ? t('currency.fewer') : t('currency.more')}
      </button>
    </div>
  );
}
