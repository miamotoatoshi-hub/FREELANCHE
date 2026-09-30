import {
  addDays,
  daysInMonth,
  dayOf,
  dayOfWeek,
  isInMonth,
  monthPhase,
  toLocalDate,
} from './dates';
import { STORAGE_SCALE } from './money';
import type { LocalDate, YearMonth } from './types';

/**
 * Pure financial calculations. Every function takes plain data, returns plain
 * data, never mutates its inputs and copes with empty or odd input.
 * All money values are stored amounts (integer hundredths of the major unit).
 */

export interface DatedAmount {
  date: LocalDate;
  amount: number;
}

const isUsable = (entry: DatedAmount): boolean =>
  Number.isFinite(entry.amount) && entry.amount > 0 && typeof entry.date === 'string';

/** Sum of all income in a calendar month. */
export function calculateMonthlyIncome(entries: readonly DatedAmount[], ym: YearMonth): number {
  let total = 0;
  for (const entry of entries) {
    if (isUsable(entry) && isInMonth(entry.date, ym)) total += entry.amount;
  }
  return total;
}

/** Sum of all income on one calendar day. */
export function calculateDailyIncome(entries: readonly DatedAmount[], date: LocalDate): number {
  let total = 0;
  for (const entry of entries) {
    if (isUsable(entry) && entry.date === date) total += entry.amount;
  }
  return total;
}

/** Calendar days of the month that have started: all of a past month, 0 of a future one. */
export function calculateElapsedDays(ym: YearMonth, today: LocalDate): number {
  const phase = monthPhase(ym, today);
  if (phase === 'future') return 0;
  return phase === 'past' ? daysInMonth(ym.year, ym.month) : dayOf(today);
}

/** Days left in the month *including today*. Zero once the month is over. */
export function calculateRemainingDays(ym: YearMonth, today: LocalDate): number {
  const phase = monthPhase(ym, today);
  if (phase === 'past') return 0;
  const total = daysInMonth(ym.year, ym.month);
  return phase === 'future' ? total : total - dayOf(today) + 1;
}

/** Average income per elapsed calendar day, rounded to the nearest stored unit. */
export function calculateAverageDailyIncome(monthlyIncome: number, elapsedDays: number): number {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return 0;
  return Math.round(monthlyIncome / Math.max(1, Math.floor(elapsedDays)));
}

/** What is still missing to reach the goal (never negative). */
export function calculateRemainingGoal(goal: number, income: number): number {
  return Math.max((Number.isFinite(goal) ? goal : 0) - (Number.isFinite(income) ? income : 0), 0);
}

export interface GoalProgress {
  hasGoal: boolean;
  goal: number;
  income: number;
  remaining: number;
  overGoal: number;
  /** Real progress: 0.5 = half way, 1.14 = 14 % over. */
  progress: number;
  /** Progress for drawing: never above 1. */
  visualProgress: number;
  /** Whole percent, rounded *down* so "100 %" is only shown once the goal is truly met. */
  percent: number;
  reached: boolean;
  exceeded: boolean;
}

export function calculateGoalProgress(goal: number, income: number): GoalProgress {
  const safeGoal = Number.isFinite(goal) && goal > 0 ? goal : 0;
  const safeIncome = Number.isFinite(income) && income > 0 ? income : 0;
  const hasGoal = safeGoal > 0;
  const progress = hasGoal ? safeIncome / safeGoal : 0;
  return {
    hasGoal,
    goal: safeGoal,
    income: safeIncome,
    remaining: calculateRemainingGoal(safeGoal, safeIncome),
    overGoal: hasGoal ? Math.max(safeIncome - safeGoal, 0) : 0,
    progress,
    visualProgress: Math.min(progress, 1),
    percent: Math.floor(progress * 100 + 1e-9),
    reached: hasGoal && safeIncome >= safeGoal,
    exceeded: hasGoal && safeIncome > safeGoal,
  };
}

/**
 * What to earn per remaining day to reach the goal, rounded *up* to a whole
 * major unit so following it never leaves the goal short. `null` when the
 * question makes no sense (no days left, nothing remaining).
 */
export function calculateRequiredDailyIncome(remaining: number, remainingDays: number): number | null {
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  if (!Number.isFinite(remainingDays) || remainingDays < 1) return null;
  const perDay = remaining / Math.floor(remainingDays);
  return Math.ceil(perDay / STORAGE_SCALE) * STORAGE_SCALE;
}

export interface BestDay {
  date: LocalDate;
  amount: number;
}

/** The single day with the most income in the month. Ties go to the earlier date. */
export function calculateBestDay(entries: readonly DatedAmount[], ym: YearMonth): BestDay | null {
  const perDay = new Map<LocalDate, number>();
  for (const entry of entries) {
    if (isUsable(entry) && isInMonth(entry.date, ym)) {
      perDay.set(entry.date, (perDay.get(entry.date) ?? 0) + entry.amount);
    }
  }
  let best: BestDay | null = null;
  for (const [date, amount] of perDay) {
    if (!best || amount > best.amount || (amount === best.amount && date < best.date)) {
      best = { date, amount };
    }
  }
  return best;
}

export interface IncomeChange {
  difference: number;
  /** Percent change versus the previous month; `null` when there is nothing to compare with. */
  percentage: number | null;
}

export function calculateIncomeChange(current: number, previous: number): IncomeChange {
  const difference = current - previous;
  return { difference, percentage: previous !== 0 ? (difference / previous) * 100 : null };
}

/**
 * Consecutive calendar days with income, ending today. A day that has not
 * finished yet does not break the streak: if nothing is logged today, the count
 * runs back from yesterday.
 */
export function calculateIncomeStreak(entries: readonly DatedAmount[], today: LocalDate): number {
  const days = new Set<LocalDate>();
  for (const entry of entries) if (isUsable(entry)) days.add(entry.date);
  let cursor = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Number of distinct days in the month with at least one entry. */
export function calculateDaysWithIncome(entries: readonly DatedAmount[], ym: YearMonth): number {
  const days = new Set<LocalDate>();
  for (const entry of entries) {
    if (isUsable(entry) && isInMonth(entry.date, ym)) days.add(entry.date);
  }
  return days.size;
}

export interface CumulativePoint {
  day: number;
  date: LocalDate;
  /** Income earned on this day alone. */
  amount: number;
  /** Everything earned from the 1st up to and including this day. */
  cumulative: number;
}

/** Running total for each day of the month, days without income included. */
export function calculateCumulativeIncome(
  entries: readonly DatedAmount[],
  ym: YearMonth,
  throughDay: number = daysInMonth(ym.year, ym.month),
): CumulativePoint[] {
  const total = daysInMonth(ym.year, ym.month);
  const last = Math.max(0, Math.min(Math.floor(throughDay), total));
  const perDay = new Array<number>(total + 1).fill(0);
  for (const entry of entries) {
    if (isUsable(entry) && isInMonth(entry.date, ym)) perDay[dayOf(entry.date)]! += entry.amount;
  }
  const points: CumulativePoint[] = [];
  let running = 0;
  for (let day = 1; day <= last; day += 1) {
    const amount = perDay[day]!;
    running += amount;
    points.push({ day, date: toLocalDate(ym.year, ym.month, day), amount, cumulative: running });
  }
  return points;
}

/** Monday–Friday days in the month up to `throughDay`. Used for "per working day". */
export function countWeekdays(ym: YearMonth, throughDay: number): number {
  const last = Math.min(Math.floor(throughDay), daysInMonth(ym.year, ym.month));
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    const weekday = dayOfWeek(toLocalDate(ym.year, ym.month, day));
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
