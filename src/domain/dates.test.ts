import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  clampMonth,
  compareMonths,
  dayOfWeek,
  daysInMonth,
  defaultDateForMonth,
  isInMonth,
  isValidLocalDate,
  monthKey,
  monthOf,
  monthPhase,
  parseLocalDate,
  todayLocal,
  toLocalDate,
} from './dates';

describe('daysInMonth', () => {
  it('knows 28, 29, 30 and 31 day months', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28); // century rule
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('local dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidLocalDate('2026-09-30')).toBe(true);
    expect(isValidLocalDate('2028-02-29')).toBe(true);
    expect(isValidLocalDate('2026-02-29')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
    expect(isValidLocalDate('2026-9-3')).toBe(false);
    expect(isValidLocalDate('2026-09-31')).toBe(false);
    expect(isValidLocalDate('')).toBe(false);
    expect(isValidLocalDate(undefined)).toBe(false);
    expect(isValidLocalDate('1999-12-31')).toBe(false);
    expect(parseLocalDate('2026-09-30')).toEqual({ year: 2026, month: 9, day: 30 });
  });

  it('formats and round-trips', () => {
    expect(toLocalDate(2026, 3, 5)).toBe('2026-03-05');
    expect(monthOf('2026-03-05')).toEqual({ year: 2026, month: 3 });
    expect(monthKey({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('todayLocal uses the local calendar date, not UTC', () => {
    // 23:30 local on Sept 30 must stay Sept 30 whatever the UTC offset is.
    expect(todayLocal(new Date(2026, 8, 30, 23, 30))).toBe('2026-09-30');
    expect(todayLocal(new Date(2026, 9, 1, 0, 5))).toBe('2026-10-01');
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30'); // a DST night in Europe
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });

  it('knows the day of the week', () => {
    expect(dayOfWeek('2026-09-01')).toBe(2); // Tuesday
    expect(dayOfWeek('2026-09-06')).toBe(0); // Sunday
  });
});

describe('months', () => {
  it('adds months across years', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 9 }, -21)).toEqual({ year: 2024, month: 12 });
    expect(addMonths({ year: 2026, month: 9 }, 0)).toEqual({ year: 2026, month: 9 });
  });

  it('compares and matches', () => {
    expect(compareMonths({ year: 2026, month: 9 }, { year: 2026, month: 10 })).toBeLessThan(0);
    expect(compareMonths({ year: 2027, month: 1 }, { year: 2026, month: 12 })).toBeGreaterThan(0);
    expect(isInMonth('2026-09-30', { year: 2026, month: 9 })).toBe(true);
    expect(isInMonth('2026-10-01', { year: 2026, month: 9 })).toBe(false);
  });

  it('classifies past / current / future', () => {
    expect(monthPhase({ year: 2026, month: 8 }, '2026-09-30')).toBe('past');
    expect(monthPhase({ year: 2026, month: 9 }, '2026-09-30')).toBe('current');
    expect(monthPhase({ year: 2026, month: 10 }, '2026-09-30')).toBe('future');
    expect(monthPhase({ year: 2025, month: 12 }, '2026-01-01')).toBe('past');
  });

  it('keeps month navigation inside sensible bounds', () => {
    expect(clampMonth({ year: 1990, month: 1 }, '2026-09-30')).toEqual({ year: 2000, month: 1 });
    expect(clampMonth({ year: 2040, month: 1 }, '2026-09-30')).toEqual({ year: 2028, month: 9 });
    expect(clampMonth({ year: 2026, month: 12 }, '2026-09-30')).toEqual({ year: 2026, month: 12 });
  });
});

describe('defaultDateForMonth', () => {
  it('uses today for the current month, otherwise a day inside the viewed month', () => {
    expect(defaultDateForMonth({ year: 2026, month: 9 }, '2026-09-30')).toBe('2026-09-30');
    expect(defaultDateForMonth({ year: 2026, month: 8 }, '2026-09-30')).toBe('2026-08-31');
    expect(defaultDateForMonth({ year: 2028, month: 2 }, '2028-03-05')).toBe('2028-02-29');
    expect(defaultDateForMonth({ year: 2026, month: 11 }, '2026-09-30')).toBe('2026-11-01');
  });
});
