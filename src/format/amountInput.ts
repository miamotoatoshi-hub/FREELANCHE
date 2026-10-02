import { currencyFractionDigits, normalizeNumerals } from '../domain/money';
import { decimalSeparator, formatDigits, groupSeparator } from './formatters';

/**
 * Live number formatting for the amount field. The field keeps a plain "raw"
 * string (ASCII digits plus at most one decimal mark) and shows it grouped the
 * way the locale writes numbers — 200,000 / 200 000 / 2,00,000 / ٢٠٠٬٠٠٠ — so
 * "₽200,000" is readable as you type.
 */

export interface AmountInputContext {
  locale: string;
  currency: string;
}

/** Longest whole-number part accepted while typing (the validator reports "too large" beyond the real limit). */
const MAX_INTEGER_DIGITS = 10;
const MAX_DECIMALS = 2;

/** The decimal mark used inside raw strings for this locale (always ASCII). */
export const rawDecimalMark = (locale: string): string => normalizeNumerals(decimalSeparator(locale)) || '.';

/**
 * Cleans what is in the input into a raw string. Handles any numeral system and
 * ignores the locale's thousands separator, so re-reading its own grouped output
 * is lossless. The first `.` or `,` that isn't this locale's grouping mark becomes the decimal mark.
 */
export function rawFromText(text: string, { locale, currency }: AmountInputContext): string {
  const group = normalizeNumerals(groupSeparator(locale));
  const decimalsAllowed = currencyFractionDigits(currency) > 0;
  let whole = '';
  let fraction = '';
  let hasMark = false;

  for (const char of normalizeNumerals(text)) {
    if (char >= '0' && char <= '9') {
      if (hasMark) {
        if (fraction.length < MAX_DECIMALS) fraction += char;
      } else if (whole.length < MAX_INTEGER_DIGITS) {
        whole += char;
      }
    } else if ((char === '.' || char === ',') && char !== group && !hasMark && decimalsAllowed) {
      hasMark = true;
    }
  }

  whole = whole.replace(/^0+(?=\d)/, '');
  return hasMark ? `${whole || '0'}${rawDecimalMark(locale)}${fraction}` : whole;
}

export interface AmountDisplay {
  text: string;
  /** Where the caret belongs after the first `rawCount` raw characters (digits and the decimal mark) have been typed. */
  caretFor: (rawCount: number) => number;
}

const isDigit = (char: string) => /\p{Nd}/u.test(char);

/** The raw string written in the locale's digits, grouping and decimal mark. */
export function displayFromRaw(raw: string, { locale }: AmountInputContext): AmountDisplay {
  const markIndex = raw.search(/[.,]/);
  const hasMark = markIndex !== -1;
  const whole = (hasMark ? raw.slice(0, markIndex) : raw).replace(/\D/g, '');
  const fraction = hasMark ? raw.slice(markIndex + 1).replace(/\D/g, '') : '';

  const decimal = decimalSeparator(locale);
  const wholeText = formatDigits(whole || (hasMark ? '0' : ''), locale);
  // Fraction digits are written one by one so a leading zero ("05") survives.
  const fractionText = fraction
    .split('')
    .map((digit) => formatDigits(digit, locale))
    .join('');
  const text = `${wholeText}${hasMark ? decimal + fractionText : ''}`;

  // Each raw character is either a digit or the decimal mark; remember where each one ends in the display text.
  const ends: number[] = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (isDigit(text[i]!)) ends.push(i + 1);
    else if (hasMark && i === wholeText.length) ends.push(i + decimal.length);
  }
  return { text, caretFor: (rawCount) => ends[Math.min(Math.max(rawCount, 0), ends.length - 1)]! };
}
