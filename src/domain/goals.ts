import { addMonths, compareMonths, MIN_YEAR, monthKey } from './dates';
import type { MonthlyGoal, YearMonth } from './types';

export type GoalSource = 'explicit' | 'inherited' | 'default';

export interface ResolvedGoal {
  /** Stored amount; 0 means "no goal". */
  amount: number;
  source: GoalSource;
}

export const goalId = (ym: YearMonth): string => monthKey(ym);

/**
 * The goal that applies to a month:
 *  1. a goal set for that exact month, otherwise
 *  2. the most recent earlier month's goal (goals carry forward), otherwise
 *  3. the earliest goal ever set (it has always been that way until first changed), otherwise
 *  4. the default goal from settings.
 * Derived on the fly, so nothing is written just because a month was viewed.
 */
export function resolveMonthlyGoal(
  goals: readonly MonthlyGoal[],
  ym: YearMonth,
  defaultGoal: number,
): ResolvedGoal {
  let exact: MonthlyGoal | undefined;
  let previous: MonthlyGoal | undefined;
  let earliest: MonthlyGoal | undefined;
  for (const goal of goals) {
    const order = compareMonths(goal, ym);
    if (order === 0) exact = goal;
    else if (order < 0 && (!previous || compareMonths(goal, previous) > 0)) previous = goal;
    if (!earliest || compareMonths(goal, earliest) < 0) earliest = goal;
  }
  if (exact) return { amount: exact.amount, source: 'explicit' };
  if (previous) return { amount: previous.amount, source: 'inherited' };
  if (earliest) return { amount: earliest.amount, source: 'inherited' };
  return { amount: Math.max(defaultGoal, 0), source: 'default' };
}

/** Returns a new list with the month's goal set (replacing any existing one). */
export function withMonthlyGoal(goals: readonly MonthlyGoal[], ym: YearMonth, amount: number): MonthlyGoal[] {
  const id = goalId(ym);
  const next: MonthlyGoal = { id, year: ym.year, month: ym.month, amount };
  const rest = goals.filter((goal) => goal.id !== id);
  return [...rest, next].sort((a, b) => compareMonths(a, b));
}

/**
 * Sets a month's goal so that it applies from that month onward and nothing
 * before it changes. If no earlier month has a goal of its own, the months
 * before `ym` are currently showing whatever this month resolves to — so that
 * value is first pinned to the month just before, then the new goal is set.
 */
export function withGoalFrom(
  goals: readonly MonthlyGoal[],
  ym: YearMonth,
  amount: number,
  defaultGoal: number,
): MonthlyGoal[] {
  const current = resolveMonthlyGoal(goals, ym, defaultGoal).amount;
  const hasEarlier = goals.some((goal) => compareMonths(goal, ym) < 0);
  const before = addMonths(ym, -1);
  const pin = !hasEarlier && current !== amount && before.year >= MIN_YEAR;
  return withMonthlyGoal(pin ? withMonthlyGoal(goals, before, current) : goals, ym, amount);
}
