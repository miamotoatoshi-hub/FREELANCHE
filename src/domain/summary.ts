import { deriveAppState } from './appState';
import {
  calculateAverageDailyIncome,
  calculateBestDay,
  calculateCumulativeIncome,
  calculateDailyIncome,
  calculateDaysWithIncome,
  calculateElapsedDays,
  calculateGoalProgress,
  calculateIncomeChange,
  calculateIncomeStreak,
  calculateMonthlyIncome,
  calculateRemainingDays,
  calculateRequiredDailyIncome,
  countWeekdays,
  type BestDay,
  type CumulativePoint,
  type GoalProgress,
  type IncomeChange,
} from './calculations';
import { addDays, addMonths, dayOf, daysInMonth, isInMonth, monthPhase, type MonthPhase } from './dates';
import { resolveMonthlyGoal, type ResolvedGoal } from './goals';
import type { AppData, AppState, LocalDate, YearMonth } from './types';

export interface MonthSummary {
  ym: YearMonth;
  phase: MonthPhase;
  appState: AppState;
  income: number;
  entryCount: number;
  goal: ResolvedGoal;
  progress: GoalProgress;
  daysInMonth: number;
  elapsedDays: number;
  remainingDays: number;
  /** Average per elapsed day (whole month for past months). 0 for future months. */
  dailyAverage: number;
  /** Stored amount to earn per remaining day; null when not applicable. */
  requiredDaily: number | null;
  bestDay: BestDay | null;
  daysWithIncome: number;
  /** Average per Monday–Friday day so far. null with no entries or no weekdays yet. */
  averagePerWorkingDay: number | null;
  /** Cumulative series: through today for the current month, the whole month otherwise. */
  series: CumulativePoint[];
  /** Only meaningful when the selected month is the current one. */
  today: { income: number; yesterday: number } | null;
  streak: number;
  previous: { ym: YearMonth; income: number; change: IncomeChange; hasData: boolean };
}

export interface SummaryInput {
  data: Pick<AppData, 'entries' | 'goals' | 'settings'>;
  ym: YearMonth;
  today: LocalDate;
  loadFailed?: boolean;
}

/** Everything the dashboard, chart and insights need for one month, derived from raw entries. */
export function buildMonthSummary({ data, ym, today, loadFailed = false }: SummaryInput): MonthSummary {
  const { entries, goals, settings } = data;
  const phase = monthPhase(ym, today);
  const total = daysInMonth(ym.year, ym.month);
  const income = calculateMonthlyIncome(entries, ym);
  const entryCount = entries.reduce((count, entry) => count + (isInMonth(entry.date, ym) ? 1 : 0), 0);
  const goal = resolveMonthlyGoal(goals, ym, settings.defaultMonthlyGoal);
  const progress = calculateGoalProgress(goal.amount, income);

  const elapsedDays = calculateElapsedDays(ym, today);
  const remainingDays = calculateRemainingDays(ym, today);
  const requiredDaily =
    phase === 'current' ? calculateRequiredDailyIncome(progress.remaining, remainingDays) : null;

  const previousYm = addMonths(ym, -1);
  const previousIncome = calculateMonthlyIncome(entries, previousYm);
  const weekdays = countWeekdays(ym, phase === 'current' ? dayOf(today) : total);

  return {
    ym,
    phase,
    appState: deriveAppState({
      loadFailed,
      onboardingCompleted: settings.onboardingCompleted,
      phase,
      entryCount,
      progress,
    }),
    income,
    entryCount,
    goal,
    progress,
    daysInMonth: total,
    elapsedDays,
    remainingDays,
    dailyAverage: phase === 'future' ? 0 : calculateAverageDailyIncome(income, elapsedDays),
    requiredDaily,
    bestDay: calculateBestDay(entries, ym),
    daysWithIncome: calculateDaysWithIncome(entries, ym),
    averagePerWorkingDay:
      entryCount > 0 && weekdays > 0 && phase !== 'future' ? Math.round(income / weekdays) : null,
    series: calculateCumulativeIncome(entries, ym, phase === 'current' ? dayOf(today) : phase === 'past' ? total : 0),
    today:
      phase === 'current'
        ? {
            income: calculateDailyIncome(entries, today),
            yesterday: calculateDailyIncome(entries, addDays(today, -1)),
          }
        : null,
    streak: calculateIncomeStreak(entries, today),
    previous: {
      ym: previousYm,
      income: previousIncome,
      change: calculateIncomeChange(income, previousIncome),
      hasData: previousIncome > 0,
    },
  };
}
