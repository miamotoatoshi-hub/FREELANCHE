import {
  currencyAffix,
  decimalSeparator,
  formatCompactNumber,
  formatDayMonth,
  formatDayMonthShort,
  formatDayMonthYear,
  formatFullDate,
  formatInteger,
  formatMoney,
  formatMonthName,
  formatMonthYear,
  formatPercent,
  formatShortDate,
  formatWeekdayNarrow,
  type FormatContext,
  type MoneyOptions,
} from './formatters';
import type { LocalDate, YearMonth } from '../domain/types';

/** Formatters pre-bound to one locale + currency, so components never pass them around. */
export function createFormatter(context: FormatContext) {
  const { locale } = context;
  return {
    locale,
    currency: context.currency,
    decimalMark: decimalSeparator(locale),
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
