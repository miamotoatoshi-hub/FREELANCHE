import { describe, expect, it } from 'vitest';
import { dataWith, entry, m } from '../test/helpers';
import { buildMonthSummary } from './summary';
import { setMonthGoal } from './usecases';

const TODAY = '2026-09-10';
const SEPT = { year: 2026, month: 9 };

describe('buildMonthSummary — current month', () => {
  const entries = [
    entry('2026-09-01', 500),
    entry('2026-09-05', 720),
    entry('2026-09-09', 120),
    entry('2026-09-10', 200),
    entry('2026-09-10', 150),
    entry('2026-08-20', 2000),
  ];
  const summary = buildMonthSummary({ data: dataWith(entries), ym: SEPT, today: TODAY });

  it('adds up income, goal, progress and what is left', () => {
    expect(summary.income).toBe(m(1690));
    expect(summary.goal.amount).toBe(m(3000));
    expect(summary.progress.percent).toBe(56);
    expect(summary.progress.remaining).toBe(m(1310));
    expect(summary.appState).toBe('Active');
  });

  it('averages over elapsed days including today', () => {
    expect(summary.elapsedDays).toBe(10);
    expect(summary.dailyAverage).toBe(m(169));
  });

  it('asks for the remaining amount spread over the remaining days including today', () => {
    expect(summary.remainingDays).toBe(21);
    // 1310 / 21 = 62.38 → €63
    expect(summary.requiredDaily).toBe(m(63));
  });

  it('reports today, yesterday, best day, streak and days with income', () => {
    expect(summary.today).toEqual({ income: m(350), yesterday: m(120) });
    expect(summary.bestDay).toEqual({ date: '2026-09-05', amount: m(720) });
    expect(summary.streak).toBe(2);
    expect(summary.daysWithIncome).toBe(4);
  });

  it('charts only up to today, ending at the monthly total', () => {
    expect(summary.series).toHaveLength(10);
    expect(summary.series.at(-1)!.cumulative).toBe(summary.income);
  });

  it('compares with the previous month', () => {
    expect(summary.previous.income).toBe(m(2000));
    expect(summary.previous.change.difference).toBe(m(-310));
    expect(summary.previous.change.percentage).toBeCloseTo(-15.5, 5);
    expect(summary.previous.hasData).toBe(true);
  });
});

describe('buildMonthSummary — states', () => {
  it('a brand-new month is Empty, never celebrating', () => {
    const summary = buildMonthSummary({ data: dataWith([]), ym: SEPT, today: TODAY });
    expect(summary.appState).toBe('Empty');
    expect(summary.income).toBe(0);
    expect(summary.progress.reached).toBe(false);
    expect(summary.bestDay).toBeNull();
    expect(summary.averagePerWorkingDay).toBeNull();
    expect(summary.series.every((p) => p.cumulative === 0)).toBe(true);
  });

  it('GoalReached at exactly the goal, GoalExceeded above it', () => {
    const reached = buildMonthSummary({ data: dataWith([entry('2026-09-02', 3000)]), ym: SEPT, today: TODAY });
    expect(reached.appState).toBe('GoalReached');
    expect(reached.requiredDaily).toBeNull();
    const exceeded = buildMonthSummary({ data: dataWith([entry('2026-09-02', 3420)]), ym: SEPT, today: TODAY });
    expect(exceeded.appState).toBe('GoalExceeded');
    expect(exceeded.progress.overGoal).toBe(m(420));
    expect(exceeded.progress.visualProgress).toBe(1);
  });

  it('NoGoal when the goal is 0, but income is still tracked', () => {
    const data = dataWith([entry('2026-09-02', 100)], { defaultMonthlyGoal: 0 });
    const summary = buildMonthSummary({ data, ym: SEPT, today: TODAY });
    expect(summary.appState).toBe('NoGoal');
    expect(summary.income).toBe(m(100));
    expect(summary.progress.percent).toBe(0);
    expect(summary.requiredDaily).toBeNull();
  });

  it('a historical month uses the whole month and asks for no daily requirement', () => {
    const data = dataWith([entry('2026-08-10', 3100)]);
    const summary = buildMonthSummary({ data, ym: { year: 2026, month: 8 }, today: TODAY });
    expect(summary.appState).toBe('HistoricalMonth');
    expect(summary.elapsedDays).toBe(31);
    expect(summary.dailyAverage).toBe(m(100));
    expect(summary.requiredDaily).toBeNull();
    expect(summary.today).toBeNull();
    expect(summary.series).toHaveLength(31);
  });

  it('a future month is FutureMonth with no invented numbers', () => {
    const summary = buildMonthSummary({ data: dataWith([entry('2026-09-02', 500)]), ym: { year: 2026, month: 11 }, today: TODAY });
    expect(summary.appState).toBe('FutureMonth');
    expect(summary.income).toBe(0);
    expect(summary.dailyAverage).toBe(0);
    expect(summary.requiredDaily).toBeNull();
    expect(summary.series).toEqual([]);
    expect(summary.today).toBeNull();
  });

  it('FirstLaunch and Error take priority over everything else', () => {
    const fresh = dataWith([entry('2026-09-02', 500)], { onboardingCompleted: false });
    expect(buildMonthSummary({ data: fresh, ym: SEPT, today: TODAY }).appState).toBe('FirstLaunch');
    expect(buildMonthSummary({ data: fresh, ym: SEPT, today: TODAY, loadFailed: true }).appState).toBe('Error');
  });

  it('a later goal change does not alter an earlier month', () => {
    let data = dataWith([entry('2026-08-10', 1500)], { defaultMonthlyGoal: m(3000) });
    const changed = setMonthGoal(data, SEPT, m(6000));
    if (changed.ok) data = changed.value;
    const august = buildMonthSummary({ data, ym: { year: 2026, month: 8 }, today: TODAY });
    expect(august.goal.amount).toBe(m(3000));
    expect(august.progress.percent).toBe(50);
  });

  it('average per working day only counts Monday–Friday', () => {
    // Sept 1–10 2026 has 8 weekdays (Sept 5, 6 are the weekend).
    const summary = buildMonthSummary({ data: dataWith([entry('2026-09-03', 800)]), ym: SEPT, today: TODAY });
    expect(summary.averagePerWorkingDay).toBe(m(100));
  });
});
