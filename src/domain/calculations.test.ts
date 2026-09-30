import { describe, expect, it } from 'vitest';
import { dataWith, entry, m, testDeps } from '../test/helpers';
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
  calculateRemainingGoal,
  calculateRequiredDailyIncome,
  countWeekdays,
} from './calculations';
import { deleteIncome, updateIncome } from './usecases';

const SEPT = { year: 2026, month: 9 };

describe('spec scenarios', () => {
  it('1 — monthly income sums €100 + €200 + €300', () => {
    const entries = [entry('2026-09-01', 100), entry('2026-09-02', 200), entry('2026-09-03', 300)];
    expect(calculateMonthlyIncome(entries, SEPT)).toBe(m(600));
  });

  it('2 — goal progress: €500 of €1,000 is 50 %', () => {
    const progress = calculateGoalProgress(m(1000), m(500));
    expect(progress.progress).toBe(0.5);
    expect(progress.percent).toBe(50);
    expect(progress.remaining).toBe(m(500));
    expect(progress.reached).toBe(false);
  });

  it('3 — goal exceeded: remaining 0, over-goal €500, visual progress capped at 100 %', () => {
    const progress = calculateGoalProgress(m(1000), m(1500));
    expect(progress.remaining).toBe(0);
    expect(progress.overGoal).toBe(m(500));
    expect(progress.visualProgress).toBe(1);
    expect(progress.progress).toBe(1.5);
    expect(progress.exceeded).toBe(true);
    expect(progress.reached).toBe(true);
  });

  it('4 — required daily income: €1,500 left over 10 days is €150/day', () => {
    const remaining = calculateRemainingGoal(m(3000), m(1500));
    expect(calculateRequiredDailyIncome(remaining, 10)).toBe(m(150));
  });

  it('5 — previous month comparison: €3,000 vs €2,500 is +€500 / +20 %', () => {
    const change = calculateIncomeChange(m(3000), m(2500));
    expect(change.difference).toBe(m(500));
    expect(change.percentage).toBeCloseTo(20, 10);
  });

  it('6 — a zero previous month gives no percentage', () => {
    const change = calculateIncomeChange(m(1000), 0);
    expect(change.difference).toBe(m(1000));
    expect(change.percentage).toBeNull();
  });

  it('7 — multiple transactions on one day add up', () => {
    const entries = [entry('2026-09-10', 100), entry('2026-09-10', 200), entry('2026-09-10', 300)];
    expect(calculateDailyIncome(entries, '2026-09-10')).toBe(m(600));
  });

  it('8 — deleting a €200 transaction takes €600 to €400', () => {
    const a = entry('2026-09-01', 100);
    const b = entry('2026-09-02', 200);
    const c = entry('2026-09-03', 300);
    const result = deleteIncome(dataWith([a, b, c]), b.id);
    expect(result.ok && calculateMonthlyIncome(result.value.entries, SEPT)).toBe(m(400));
  });

  it('9 — editing €100 → €500 takes €600 to €1,000', () => {
    const a = entry('2026-09-01', 100);
    const b = entry('2026-09-02', 200);
    const c = entry('2026-09-03', 300);
    const result = updateIncome(dataWith([a, b, c]), a.id, { amount: m(500), date: a.date }, testDeps());
    expect(result.ok && calculateMonthlyIncome(result.value.entries, SEPT)).toBe(m(1000));
  });
});

describe('monthly income', () => {
  it('ignores other months, including adjacent ones', () => {
    const entries = [entry('2026-08-31', 999), entry('2026-09-01', 10), entry('2026-09-30', 20), entry('2026-10-01', 999)];
    expect(calculateMonthlyIncome(entries, SEPT)).toBe(m(30));
  });

  it('handles empty data and junk amounts safely', () => {
    expect(calculateMonthlyIncome([], SEPT)).toBe(0);
    const junk = [{ date: '2026-09-01', amount: Number.NaN }, { date: '2026-09-01', amount: -5 }];
    expect(calculateMonthlyIncome(junk, SEPT)).toBe(0);
  });

  it('is exact for decimal amounts', () => {
    const entries = [entry('2026-09-01', 0.1), entry('2026-09-01', 0.2), entry('2026-09-02', 125.5)];
    expect(calculateMonthlyIncome(entries, SEPT)).toBe(12580);
  });

  it('moving an entry to another month updates both months', () => {
    const a = entry('2026-08-20', 100);
    const b = entry('2026-09-05', 250);
    const moved = updateIncome(dataWith([a, b]), b.id, { amount: b.amount, date: '2026-08-31' }, testDeps());
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(calculateMonthlyIncome(moved.value.entries, SEPT)).toBe(0);
    expect(calculateMonthlyIncome(moved.value.entries, { year: 2026, month: 8 })).toBe(m(350));
  });
});

describe('goal progress edge cases', () => {
  it('never divides by zero when the goal is zero or unset', () => {
    for (const goal of [0, -10, Number.NaN]) {
      const progress = calculateGoalProgress(goal, m(500));
      expect(progress.hasGoal).toBe(false);
      expect(progress.progress).toBe(0);
      expect(progress.visualProgress).toBe(0);
      expect(progress.reached).toBe(false);
      expect(progress.overGoal).toBe(0);
    }
  });

  it('zero income against a goal is 0 % with the whole goal remaining', () => {
    const progress = calculateGoalProgress(m(3000), 0);
    expect(progress.percent).toBe(0);
    expect(progress.remaining).toBe(m(3000));
    expect(progress.reached).toBe(false);
  });

  it('exactly meeting the goal is reached but not exceeded', () => {
    const progress = calculateGoalProgress(m(3000), m(3000));
    expect(progress.reached).toBe(true);
    expect(progress.exceeded).toBe(false);
    expect(progress.percent).toBe(100);
    expect(progress.overGoal).toBe(0);
  });

  it('shows 99 % (not 100 %) until the goal is actually met', () => {
    expect(calculateGoalProgress(m(1000), m(999.9)).percent).toBe(99);
  });

  it('over-goal amount: €3,420 vs €3,000 is €420 over', () => {
    expect(calculateGoalProgress(m(3000), m(3420)).overGoal).toBe(m(420));
  });
});

describe('days in the month', () => {
  it.each([
    ['31-day month', { year: 2026, month: 1 }, '2026-01-31', 31, 1],
    ['30-day month', { year: 2026, month: 4 }, '2026-04-30', 30, 1],
    ['February, 28 days', { year: 2026, month: 2 }, '2026-02-28', 28, 1],
    ['February, 29 days', { year: 2028, month: 2 }, '2028-02-29', 29, 1],
  ])('%s: last day has %i elapsed and %i remaining', (_name, ym, today, elapsed, remaining) => {
    expect(calculateElapsedDays(ym, today)).toBe(elapsed);
    expect(calculateRemainingDays(ym, today)).toBe(remaining);
  });

  it('first day of a month: 1 elapsed, whole month remaining', () => {
    expect(calculateElapsedDays(SEPT, '2026-09-01')).toBe(1);
    expect(calculateRemainingDays(SEPT, '2026-09-01')).toBe(30);
  });

  it('past months are fully elapsed with nothing remaining; future months have nothing elapsed', () => {
    expect(calculateElapsedDays({ year: 2026, month: 8 }, '2026-09-15')).toBe(31);
    expect(calculateRemainingDays({ year: 2026, month: 8 }, '2026-09-15')).toBe(0);
    expect(calculateElapsedDays({ year: 2026, month: 10 }, '2026-09-15')).toBe(0);
  });

  it('crosses a year boundary correctly', () => {
    expect(calculateElapsedDays({ year: 2025, month: 12 }, '2026-01-05')).toBe(31);
    expect(calculateElapsedDays({ year: 2027, month: 1 }, '2026-12-31')).toBe(0);
  });
});

describe('daily average', () => {
  it('€1,500 over 10 elapsed days is €150/day', () => {
    expect(calculateAverageDailyIncome(m(1500), 10)).toBe(m(150));
  });

  it('uses at least one day, and 0 for no income', () => {
    expect(calculateAverageDailyIncome(m(200), 0)).toBe(m(200));
    expect(calculateAverageDailyIncome(0, 10)).toBe(0);
  });

  it('rounds to the nearest stored unit', () => {
    expect(calculateAverageDailyIncome(m(100), 3)).toBe(3333);
  });
});

describe('required daily income', () => {
  it('rounds up to whole currency units so the goal is never missed', () => {
    // €550 over 8 days = €68.75 → €69/day
    expect(calculateRequiredDailyIncome(m(550), 8)).toBe(m(69));
    expect(calculateRequiredDailyIncome(m(550), 10)).toBe(m(55));
  });

  it('is null when there is nothing remaining or no days left', () => {
    expect(calculateRequiredDailyIncome(0, 10)).toBeNull();
    expect(calculateRequiredDailyIncome(m(500), 0)).toBeNull();
    expect(calculateRequiredDailyIncome(Number.NaN, 5)).toBeNull();
  });

  it('the last day asks for the entire remainder', () => {
    expect(calculateRequiredDailyIncome(m(430), 1)).toBe(m(430));
  });
});

describe('best day', () => {
  it('sums entries per day and picks the highest', () => {
    const entries = [entry('2026-09-03', 300), entry('2026-09-03', 450), entry('2026-09-05', 720), entry('2026-08-31', 5000)];
    // 300 + 450 on the 3rd beats the single 720 on the 5th; the August entry is ignored.
    expect(calculateBestDay(entries, SEPT)).toEqual({ date: '2026-09-03', amount: m(750) });
  });

  it('a day of several small entries can beat one bigger entry', () => {
    const entries = [entry('2026-09-03', 100), entry('2026-09-03', 100), entry('2026-09-03', 100), entry('2026-09-04', 250)];
    expect(calculateBestDay(entries, SEPT)).toEqual({ date: '2026-09-03', amount: m(300) });
  });

  it('breaks ties toward the earlier date and returns null for empty months', () => {
    expect(calculateBestDay([entry('2026-09-09', 100), entry('2026-09-02', 100)], SEPT)?.date).toBe('2026-09-02');
    expect(calculateBestDay([], SEPT)).toBeNull();
  });
});

describe('income streak', () => {
  it('counts consecutive days ending today', () => {
    const entries = [entry('2026-09-30', 10), entry('2026-09-29', 10), entry('2026-09-28', 10), entry('2026-09-26', 10)];
    expect(calculateIncomeStreak(entries, '2026-09-30')).toBe(3);
  });

  it('does not break just because today is not logged yet', () => {
    const entries = [entry('2026-09-29', 10), entry('2026-09-28', 10)];
    expect(calculateIncomeStreak(entries, '2026-09-30')).toBe(2);
  });

  it('is zero after a gap, and spans month and year boundaries', () => {
    expect(calculateIncomeStreak([entry('2026-09-20', 10)], '2026-09-30')).toBe(0);
    const entries = [entry('2026-01-01', 1), entry('2025-12-31', 1), entry('2025-12-30', 1)];
    expect(calculateIncomeStreak(entries, '2026-01-01')).toBe(3);
  });

  it('is zero with no data', () => {
    expect(calculateIncomeStreak([], '2026-09-30')).toBe(0);
  });
});

describe('days with income', () => {
  it('counts distinct days only', () => {
    const entries = [entry('2026-09-01', 1), entry('2026-09-01', 2), entry('2026-09-04', 3), entry('2026-08-04', 3)];
    expect(calculateDaysWithIncome(entries, SEPT)).toBe(2);
  });
});

describe('cumulative income', () => {
  it('builds a running total including days with no income', () => {
    const entries = [entry('2026-09-01', 100), entry('2026-09-02', 150), entry('2026-09-04', 250)];
    const points = calculateCumulativeIncome(entries, SEPT, 4);
    expect(points.map((p) => p.cumulative)).toEqual([m(100), m(250), m(250), m(500)]);
    expect(points.map((p) => p.day)).toEqual([1, 2, 3, 4]);
  });

  it('covers the whole month by default and stops at the number of days', () => {
    expect(calculateCumulativeIncome([], SEPT)).toHaveLength(30);
    expect(calculateCumulativeIncome([], { year: 2028, month: 2 })).toHaveLength(29);
    expect(calculateCumulativeIncome([], SEPT, 99)).toHaveLength(30);
    expect(calculateCumulativeIncome([], SEPT, 0)).toEqual([]);
  });

  it('never decreases and ends at the monthly total', () => {
    const entries = [entry('2026-09-30', 40), entry('2026-09-15', 60)];
    const points = calculateCumulativeIncome(entries, SEPT);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.cumulative).toBeGreaterThanOrEqual(points[i - 1]!.cumulative);
    }
    expect(points.at(-1)!.cumulative).toBe(calculateMonthlyIncome(entries, SEPT));
  });
});

describe('weekdays', () => {
  it('counts Monday–Friday days in a month up to a day', () => {
    // September 2026 starts on a Tuesday: 22 weekdays in total.
    expect(countWeekdays(SEPT, 30)).toBe(22);
    expect(countWeekdays(SEPT, 4)).toBe(4); // Tue 1st … Fri 4th
    expect(countWeekdays(SEPT, 6)).toBe(4); // the 5th and 6th are a weekend
  });
});
