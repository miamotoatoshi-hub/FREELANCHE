import type { ErrorCode } from './types';

/**
 * Money helpers. Amounts are integers in hundredths of the major unit for every
 * currency (so JPY 1,500 is stored as 150000). This avoids floating-point drift
 * and means switching currency never rewrites stored values.
 */

export const STORAGE_SCALE = 100;

/** Largest single amount (in major units) the app accepts. */
export const MAX_AMOUNT_MAJOR = 100_000_000;
export const MAX_AMOUNT = MAX_AMOUNT_MAJOR * STORAGE_SCALE;

/** Currencies that have no fractional unit in everyday use. */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW']);

/** How many decimals a person can meaningfully type for a currency. */
export const currencyFractionDigits = (currency: string): 0 | 2 =>
  ZERO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;

/** Major units → stored amount. */
export const fromMajor = (major: number): number => Math.round(major * STORAGE_SCALE);

/** Stored amount → major units (only for display / formatting, never for arithmetic). */
export const toMajor = (amount: number): number => amount / STORAGE_SCALE;

export type AmountParseError = Extract<
  ErrorCode,
  'amount-empty' | 'amount-invalid' | 'amount-too-large' | 'amount-decimals'
>;

export type AmountParse = { ok: true; amount: number } | { ok: false; error: AmountParseError };

const bad = (error: AmountParseError): AmountParse => ({ ok: false, error });

/** "1.234" / "1,234,567": first group 1–3 digits, every other group exactly 3, one kind of mark. */
function isValidGrouping(value: string): boolean {
  return /^\d{1,3}([.,]\d{3})+$/.test(value) && new Set(value.match(/[.,]/g)).size === 1;
}

/**
 * Turns what a person typed into a stored amount. Either `.` or `,` may be the
 * decimal mark, and either may group thousands:
 *
 *   "1250"  "1 250"  "1,250"  "1.250"   → 1250   (a lone mark followed by exactly 3 digits groups thousands)
 *   "12.5"  "12,5"   "12,50"  ".5"      → 12.50 / 0.50
 *   "1.234,50"  "1,234.50"              → 1234.50
 *
 * Works on the digits only — no floating-point. Zero is accepted here; callers
 * that need "greater than zero" check afterwards.
 */
export function parseAmountInput(text: string, currency: string): AmountParse {
  const cleaned = text.replace(/[\s\u00a0\u202f']/g, '');
  if (cleaned === '') return bad('amount-empty');
  if (!/^[\d.,]+$/.test(cleaned) || !/\d/.test(cleaned)) return bad('amount-invalid');

  let whole = cleaned;
  let fraction = '';

  const lastMarkIndex = Math.max(cleaned.lastIndexOf('.'), cleaned.lastIndexOf(','));
  if (lastMarkIndex !== -1) {
    const mark = cleaned[lastMarkIndex]!;
    const before = cleaned.slice(0, lastMarkIndex);
    const after = cleaned.slice(lastMarkIndex + 1);
    const otherMark = mark === '.' ? ',' : '.';
    const markCount = cleaned.split(mark).length - 1;

    if (cleaned.includes(otherMark)) {
      // Both kinds present: the last one is the decimal mark, the other groups thousands.
      if (markCount !== 1 || !isValidGrouping(before)) return bad('amount-invalid');
      if (after.length > 2) return bad('amount-decimals');
      whole = before;
      fraction = after;
    } else if (markCount > 1) {
      // Only repeated marks: thousands grouping ("1,234,567").
      if (!isValidGrouping(cleaned)) return bad('amount-invalid');
    } else if (after.length === 3 && /^[1-9]\d{0,2}$/.test(before)) {
      // A single mark before exactly 3 digits: thousands ("1,250").
      whole = `${before}${after}`;
    } else if (after.length > 2) {
      return bad('amount-decimals');
    } else {
      // A single mark before 0–2 digits: a decimal mark ("12,5", ".5", or a trailing "12,").
      whole = before === '' ? '0' : before;
      fraction = after;
    }
  }

  const digits = whole.replace(/[.,]/g, '');
  if (currencyFractionDigits(currency) === 0 && /[1-9]/.test(fraction)) return bad('amount-decimals');

  const majorPart = Number(digits);
  if (!Number.isSafeInteger(majorPart) || majorPart > MAX_AMOUNT_MAJOR) return bad('amount-too-large');
  const amount = majorPart * STORAGE_SCALE + Number(fraction.padEnd(2, '0'));
  if (amount > MAX_AMOUNT) return bad('amount-too-large');
  return { ok: true, amount };
}

/**
 * Keeps only what can be typed into an amount field: digits, one decimal mark
 * and at most two decimals (none for zero-decimal currencies). Typed text never
 * contains thousands marks; pasted text is normalised with `parseAmountInput`.
 */
export function sanitizeAmountInput(text: string, currency: string): string {
  const stripped = text.replace(/[^\d.,]/g, '');
  const markIndex = stripped.search(/[.,]/);
  let out = stripped;
  if (currencyFractionDigits(currency) === 0) {
    out = stripped.replace(/[.,]/g, '');
  } else if (markIndex !== -1) {
    const head = stripped.slice(0, markIndex).replace(/[.,]/g, '');
    const tail = stripped.slice(markIndex + 1).replace(/[.,]/g, '').slice(0, 2);
    out = `${head}${stripped[markIndex]}${tail}`;
  }
  return out.replace(/^0+(?=\d)/, '');
}

/** A stored amount rendered for an editable field, using the given decimal mark and no grouping. */
export function amountToInput(amount: number, currency: string, decimalMark = '.'): string {
  const whole = Math.floor(amount / STORAGE_SCALE);
  const hundredths = amount % STORAGE_SCALE;
  if (currencyFractionDigits(currency) === 0 || hundredths === 0) return String(whole);
  return `${whole}${decimalMark}${String(hundredths).padStart(2, '0').replace(/0$/, '')}`;
}
