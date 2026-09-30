import { useI18n } from '../../i18n/I18nProvider';
import type { MoneyOptions } from '../../format/formatters';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface IncomeAmountProps extends MoneyOptions {
  /** Stored amount. */
  value: number;
  size?: 'hero' | 'xl' | 'lg' | 'md' | 'sm';
  /** Count up/down smoothly when the value changes. */
  animate?: boolean;
  className?: string;
}

/** A formatted money amount — the one place amounts are rendered big. */
export function IncomeAmount({ value, size = 'md', animate = false, className = '', ...format }: IncomeAmountProps) {
  const { fmt } = useI18n();
  const shown = useAnimatedNumber(value, animate ? 300 : 0);
  // Format the *target* for assistive tech so screen readers never hear a half-counted number.
  const finalText = fmt.money(value, format);
  const text = animate ? fmt.money(shown, format) : finalText;
  return (
    <span
      className={`amount amount--${size} ${className}`.trim()}
      data-length={text.length > 10 ? 'long' : text.length > 7 ? 'medium' : 'short'}
    >
      <span aria-hidden={animate ? 'true' : undefined}>{text}</span>
      {animate && <span className="sr-only">{finalText}</span>}
    </span>
  );
}
