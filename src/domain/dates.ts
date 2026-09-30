import type { LocalDate, YearMonth } from './types';

/**
 * Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings and all arithmetic
 * runs through UTC, so time zones and daylight saving can never shift a date.
 */

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseLocalDate(value: unknown): { year: number; month: number; day: number } | null {
  if (typeof value !== 'string') return null;
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export const isValidLocalDate = (value: unknown): value is LocalDate => parseLocalDate(value) !== null;

/** The user's current calendar date in their own time zone. */
export function todayLocal(now: Date = new Date()): LocalDate {
  return toLocalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function addDays(date: LocalDate, amount: number): LocalDate {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError('Invalid date');
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return toLocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): number {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError('Invalid date');
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function monthOf(date: LocalDate): YearMonth {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError('Invalid date');
  return { year: parts.year, month: parts.month };
}

export const dayOf = (date: LocalDate): number => {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError('Invalid date');
  return parts.day;
};

export const monthKey = ({ year, month }: YearMonth): string => `${pad(year, 4)}-${pad(month)}`;

export const isInMonth = (date: LocalDate, ym: YearMonth): boolean => date.startsWith(monthKey(ym) + '-');

export const compareMonths = (a: YearMonth, b: YearMonth): number =>
  a.year !== b.year ? a.year - b.year : a.month - b.month;

export const isSameMonth = (a: YearMonth, b: YearMonth): boolean => compareMonths(a, b) === 0;

export function addMonths({ year, month }: YearMonth, amount: number): YearMonth {
  const index = year * 12 + (month - 1) + amount;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export const firstDayOf = (ym: YearMonth): LocalDate => toLocalDate(ym.year, ym.month, 1);

export const lastDayOf = (ym: YearMonth): LocalDate =>
  toLocalDate(ym.year, ym.month, daysInMonth(ym.year, ym.month));

export type MonthPhase = 'past' | 'current' | 'future';

export function monthPhase(ym: YearMonth, today: LocalDate): MonthPhase {
  const order = compareMonths(ym, monthOf(today));
  return order < 0 ? 'past' : order > 0 ? 'future' : 'current';
}

/** How far the month selector may travel. */
export const FUTURE_MONTH_LIMIT = 24;

export function clampMonth(ym: YearMonth, today: LocalDate): YearMonth {
  const min: YearMonth = { year: MIN_YEAR, month: 1 };
  const max = addMonths(monthOf(today), FUTURE_MONTH_LIMIT);
  if (compareMonths(ym, min) < 0) return min;
  if (compareMonths(ym, max) > 0) return max;
  return ym;
}

/**
 * Where a new entry should land when added while viewing `ym`: today for the
 * current month, otherwise a day inside the viewed month so the entry shows up
 * on the screen the person is looking at.
 */
export function defaultDateForMonth(ym: YearMonth, today: LocalDate): LocalDate {
  const phase = monthPhase(ym, today);
  if (phase === 'current') return today;
  return phase === 'past' ? lastDayOf(ym) : firstDayOf(ym);
}
