import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { currencyName, currencySymbol, POPULAR_CURRENCIES, searchCurrencies } from '../../format/currencies';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface CurrencySelectorProps {
  /** The chosen currency, or null while the person hasn't picked one yet. */
  value: string | null;
  onSelect: (currency: string) => void;
  /** A currency to highlight as "suggested for your device". Offered, never pre-selected. */
  suggested?: string | null;
  /** Keeps the list at a fixed height with its own scrolling (used inside sheets). */
  contained?: boolean;
  /** Heading level for the group titles: 2 under a page heading, 3 under a sheet title. */
  headingLevel?: 2 | 3;
}

/**
 * Searchable currency picker. Typing filters by code, name (in the app language
 * or English) or symbol; with no search, popular currencies come first. Native
 * radio inputs give correct screen-reader and arrow-key behaviour.
 */
export function CurrencySelector({ value, onSelect, suggested = null, contained = false, headingLevel = 2 }: CurrencySelectorProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { t, tn, fmt } = useI18n();
  const group = useId();
  const [query, setQuery] = useState('');
  const locale = fmt.locale;

  const results = useMemo(() => searchCurrencies(query, locale), [query, locale]);
  const searching = query.trim() !== '';

  const row = (code: string) => (
    <label key={code} className={`currency${code === value ? ' is-selected' : ''}`}>
      <input className="sr-only" type="radio" name={group} value={code} checked={code === value} onChange={() => onSelect(code)} />
      <span className="currency__symbol" aria-hidden="true" dir="ltr">
        {currencySymbol(code, locale)}
      </span>
      <span className="currency__text">
        <span className="currency__name">{currencyName(code, locale)}</span>
        <span className="currency__code">{code}</span>
      </span>
      {code === value ? <Icon name="check" className="currency__check" /> : null}
    </label>
  );

  const section = (title: string, codes: readonly string[]): ReactNode =>
    codes.length > 0 ? (
      <div className="currencies__section" key={title}>
        <Heading className="currencies__heading">{title}</Heading>
        {codes.map(row)}
      </div>
    ) : null;

  let body: ReactNode;
  if (searching) {
    body =
      results.length > 0 ? (
        <div className="currencies__section">{results.map(row)}</div>
      ) : (
        <p className="currencies__empty">{t('currency.empty', { query: query.trim() })}</p>
      );
  } else {
    const popular = POPULAR_CURRENCIES as readonly string[];
    const rest = results.filter((code) => !popular.includes(code) && code !== suggested);
    body = (
      <>
        {suggested ? section(t('onboarding.currency.suggested'), [suggested]) : null}
        {section(
          t('currency.popular'),
          popular.filter((code) => code !== suggested),
        )}
        {section(t('currency.all'), rest)}
      </>
    );
  }

  // Enter in the search box picks the best match, so "eur⏎" is all it takes.
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searching && results[0]) {
      event.preventDefault();
      onSelect(results[0]);
    }
  };

  return (
    <div className={`currencies${contained ? ' currencies--contained' : ''}`}>
      <div className="search">
        <Icon name="search" size={20} className="search__icon" />
        <input
          className="search__input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder={t('currency.search.placeholder')}
          aria-label={t('currency.search')}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {query ? (
          <button type="button" className="search__clear" aria-label={t('common.clear')} onClick={() => setQuery('')}>
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {searching && results.length > 0 ? tn('currency.results', results.length) : ''}
      </p>
      <fieldset className="currencies__list">
        <legend className="sr-only">{t('currency.list')}</legend>
        {body}
      </fieldset>
    </div>
  );
}
