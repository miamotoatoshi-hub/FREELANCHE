import {
  currencyAffix,
  decimalSeparator,
  formatCompactNumber,
  formatDayMonth,
  formatDayMonthShort,
  formatDigits,
  formatDayMonthYear,
  formatFullDate,
  formatInteger,
  formatMoney,
  formatMonthName,
  formatMonthYear,
  formatPercent,
  formatShortDate,
  formatWeekdayNarrow,
  groupSeparator,
  type FormatContext,
  type MoneyOptions,
} from './formatters';
import type { LocalDate, YearMonth } from '../domain/types';
import { rawDecimalMark } from './amountInput';

/** Formatters pre-bound to one locale + currency, so components never pass them around. */
export function createFormatter(context: FormatContext) {
  const { locale } = context;
  return {
    locale,
    currency: context.currency,
    decimalMark: decimalSeparator(locale),
    /** ASCII decimal mark used inside the amount field's raw text. */
    rawMark: rawDecimalMark(locale),
    groupMark: groupSeparator(locale),
    digits: (value: string) => formatDigits(value, locale),
    affix: currencyAffix(context),
    money: (amount: number, options?: MoneyOptions) => formatMoney(amount, context, options),
    compact: (amount: number) => formatCompactNumber(amount, locale),
    percent: (value: number, options?: { signed?: boolean; maxFractionDigits?: number }) =>
      formatPercent(value, locale, options),
    integer: (value: number) => formatInteger(value, locale),
    monthYear: (ym: YearMonth) => formatMonthYear(ym, locale),
    monthName: (ym: YearMonth) => formatMonthName(ym, locale),
    dayMonth: (date: LocalDate) => formatDayMonth(date, locale),
    dayMonthYear: (date: LocalDate) => formatDayMonthYear(date, locale),
    dayMonthShort: (date: LocalDate) => formatDayMonthShort(date, locale),
    shortDate: (date: LocalDate) => formatShortDate(date, locale),
    fullDate: (date: LocalDate) => formatFullDate(date, locale),
    weekday: (index: number) => formatWeekdayNarrow(index, locale),
  };
}

export type Formatter = ReturnType<typeof createFormatter>;
