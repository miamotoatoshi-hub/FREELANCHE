import type { ClipboardEvent } from 'react';
import { amountToInput, parseAmountInput, sanitizeAmountInput } from '../../domain/money';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface AmountFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Receives focus (and the numeric keyboard) when its container opens. */
  autoFocus?: boolean;
  size?: 'lg' | 'md';
}

/**
 * The big number input. Shows the currency symbol on the side the locale puts
 * it, accepts `.` or `,`, cleans as you type, and understands pasted "1,234.50".
 */
export function AmountField({ id, label, value, onChange, error, autoFocus = false, size = 'lg' }: AmountFieldProps) {
  const { currency, fmt } = useI18n();
  const errorId = `${id}-error`;
  const { symbol, position } = fmt.affix;

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    event.preventDefault();
    const parsed = parseAmountInput(text, currency);
    onChange(parsed.ok ? amountToInput(parsed.amount, currency, fmt.decimalMark) : sanitizeAmountInput(text, currency));
  };

  const symbolNode = (
    <span className="amount-field__symbol" aria-hidden="true">
      {symbol}
    </span>
  );

  return (
    <div className={`amount-field amount-field--${size}${error ? ' has-error' : ''}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="amount-field__row">
        {position === 'prefix' && symbolNode}
        <input
          id={id}
          className="amount-field__input"
          type="text"
          inputMode={currency === 'JPY' || currency === 'KRW' ? 'numeric' : 'decimal'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder="0"
          value={value}
          data-autofocus={autoFocus ? '' : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          style={{ width: `${Math.max(value.length, 1)}ch` }}
          onChange={(event) => onChange(sanitizeAmountInput(event.target.value, currency))}
          onPaste={onPaste}
        />
        {position === 'suffix' && symbolNode}
      </div>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          <Icon name="alert" size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
