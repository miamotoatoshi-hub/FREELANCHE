import { parseLocalDate } from '../domain/dates';
import { currencyFractionDigits, STORAGE_SCALE, toMajor } from '../domain/money';
import type { LocalDate, YearMonth } from '../domain/types';

/**
 * Locale-aware formatting. All output comes from `Intl`, so separators, symbols,
 * symbol placement and month names follow the chosen locale automatically.
 */

export interface FormatContext {
  locale: string;
  currency: string;
}

export interface MoneyOptions {
  /** `auto` shows cents only when there are some; `none` never does; `always` always does. */
  fraction?: 'auto' | 'none' | 'always';
  /** Round up to a whole unit (for "you need €X per day"). */
  ceil?: boolean;
  /** Prefix positive numbers with "+". */
  signed?: boolean;
}

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key) as Intl.NumberFormat | undefined;
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    cache.set(key, format);
  }
  return format;
}

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale}|${JSON.stringify(options)}`;
  let format = cache.get(key) as Intl.DateTimeFormat | undefined;
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    cache.set(key, format);
  }
  return format;
}

export function formatMoney(amount: number, { locale, currency }: FormatContext, options: MoneyOptions = {}): string {
  const { fraction = 'auto', ceil = false, signed = false } = options;
  const safe = Number.isFinite(amount) ? amount : 0;
  const value = ceil ? Math.ceil(safe / STORAGE_SCALE) * STORAGE_SCALE : safe;
  const maxDigits = currencyFractionDigits(currency);
  const hasFraction = maxDigits > 0 && Math.abs(value % STORAGE_SCALE) > 0;
  const digits = fraction === 'none' ? 0 : fraction === 'always' ? maxDigits : hasFraction ? maxDigits : 0;
  return numberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...(signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(toMajor(value));
}

/** A number with no currency symbol, e.g. "1.2K" — for chart axes. */
export function formatCompactNumber(amount: number, locale: string): string {
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(toMajor(amount));
}

/** `value` is a plain percent (18.5 → "18.5%"). */
export function formatPercent(value: number, locale: string, options: { signed?: boolean; maxFractionDigits?: number } = {}): string {
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: options.maxFractionDigits ?? 1,
    ...(options.signed ? { signDisplay: 'exceptZero' as const } : {}),
  }).format(value / 100);
}

export function formatInteger(value: number, locale: string): string {
  return numberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function decimalSeparator(locale: string): string {
  return numberFormat(locale, { minimumFractionDigits: 1 }).formatToParts(1.1).find((part) => part.type === 'decimal')?.value ?? '.';
}

/** A Date at local noon — never near a DST or midnight boundary — used only for formatting. */
function asDate(date: LocalDate): Date {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError('Invalid date');
  return new Date(parts.year, parts.month - 1, parts.day, 12);
}

/** "September 2026" */
export function formatMonthYear(ym: YearMonth, locale: string): string {
  const parts = dateFormat(locale, { month: 'long', year: 'numeric' }).formatToParts(new Date(ym.year, ym.month - 1, 1, 12));
  const text = parts.map((part) => part.value).join('');
  // Some locales append a suffix such as Russian "г." — the month and year are enough here.
  const title = text.replace(/\s*г\.$/u, '').trim();
  // Some languages (Russian) write month names in lower case; a heading wants a capital.
  return title.charAt(0).toLocaleUpperCase(locale) + title.slice(1);
}

/** "September" */
export function formatMonthName(ym: YearMonth, locale: string): string {
  return dateFormat(locale, { month: 'long' }).format(new Date(ym.year, ym.month - 1, 1, 12));
}

/** "September 30" */
export function formatDayMonth(date: LocalDate, locale: string): string {
  return dateFormat(locale, { day: 'numeric', month: 'long' }).format(asDate(date));
}

/** "September 30, 2025" */
export function formatDayMonthYear(date: LocalDate, locale: string): string {
  return dateFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(asDate(date));
}

/** "Wed, Sep 30" */
export function formatShortDate(date: LocalDate, locale: string): string {
  return dateFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(asDate(date));
}

/** "Wednesday, September 30, 2026" — for screen readers and tooltips. */
export function formatFullDate(date: LocalDate, locale: string): string {
  return dateFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(asDate(date));
}

/** "Sep 30" */
export function formatDayMonthShort(date: LocalDate, locale: string): string {
  return dateFormat(locale, { day: 'numeric', month: 'short' }).format(asDate(date));
}

/** Narrow weekday label for a 0 (Sunday) – 6 index. */
export function formatWeekdayNarrow(index: number, locale: string): string {
  // 2023-01-01 was a Sunday.
  return dateFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + index, 12));
}

/** Where the currency symbol sits in this locale ("€5" vs "5 €") — for the amount field. */
export function currencyAffix({ locale, currency }: FormatContext): { symbol: string; position: 'prefix' | 'suffix' } {
  const parts = numberFormat(locale, { style: 'currency', currency, currencyDisplay: 'symbol' }).formatToParts(1);
  const at = parts.findIndex((part) => part.type === 'currency');
  const digit = parts.findIndex((part) => part.type === 'integer');
  return { symbol: parts[at]?.value ?? currency, position: at < digit ? 'prefix' : 'suffix' };
}
