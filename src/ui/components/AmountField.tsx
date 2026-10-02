import { useLayoutEffect, useMemo, useRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { amountToInput, currencyFractionDigits, parseAmountInput } from '../../domain/money';
import { displayFromRaw, rawFromText } from '../../format/amountInput';
import { useI18n } from '../../i18n/I18nProvider';
import { Icon } from './Icon';

interface AmountFieldProps {
  id: string;
  label: string;
  /** The raw text: ASCII digits and at most one decimal mark. The field shows it grouped for the locale. */
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Receives focus (and the numeric keyboard) when its container opens. */
  autoFocus?: boolean;
  size?: 'lg' | 'md';
  /** Faint example shown while empty, already formatted (e.g. "2,000"). */
  placeholder?: string;
}

/**
 * The big number input. It shows the selected currency's symbol on the side the
 * locale puts it, writes digits as you type with the locale's grouping and decimal
 * mark (200,000 · 200 000 · 2,00,000), accepts any numeral system, and understands
 * pasted "1,234.50" / "1.234,50".
 */
export function AmountField({ id, label, value, onChange, error, autoFocus = false, size = 'lg', placeholder = '0' }: AmountFieldProps) {
  const { currency, fmt } = useI18n();
  const errorId = `${id}-error`;
  const { symbol, position } = fmt.affix;
  const context = useMemo(() => ({ locale: fmt.locale, currency }), [fmt.locale, currency]);
  const display = useMemo(() => displayFromRaw(value, context), [value, context]);

  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

  // Formatting inserts separators, which would throw the caret to the end; put it back where the person was typing.
  useLayoutEffect(() => {
    const input = inputRef.current;
    const raw = pendingCaret.current;
    if (!input || raw === null) return;
    pendingCaret.current = null;
    if (document.activeElement === input) {
      const at = display.caretFor(raw);
      input.setSelectionRange(at, at);
    }
  });

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const caret = input.selectionStart ?? input.value.length;
    const next = rawFromText(input.value, context);
    const rawCaret = rawFromText(input.value.slice(0, caret), context).length;
    pendingCaret.current = rawCaret;
    if (next === value) {
      // Nothing changed (an ignored key): React won't re-render, so restore the caret ourselves.
      queueMicrotask(() => {
        pendingCaret.current = null;
        if (document.activeElement === input) {
          const at = display.caretFor(rawCaret);
          input.setSelectionRange(at, at);
        }
      });
    }
    onChange(next);
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    event.preventDefault();
    const parsed = parseAmountInput(text, currency);
    onChange(parsed.ok ? amountToInput(parsed.amount, currency, fmt.rawMark) : rawFromText(text, context));
  };

  const symbolNode = (
    <span className="amount-field__symbol" aria-hidden="true">
      {symbol}
    </span>
  );
  const widthChars = Math.max(display.text.length || placeholder.length, 1);

  return (
    <div className={`amount-field amount-field--${size}${error ? ' has-error' : ''}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="amount-field__row">
        {position === 'prefix' && symbolNode}
        <input
          ref={inputRef}
          id={id}
          className="amount-field__input"
          type="text"
          dir="ltr"
          inputMode={currencyFractionDigits(currency) === 0 ? 'numeric' : 'decimal'}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
          placeholder={placeholder}
          value={display.text}
          data-autofocus={autoFocus ? '' : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? errorId : undefined}
          style={{ width: `${widthChars}ch` }}
          onChange={handleChange}
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
