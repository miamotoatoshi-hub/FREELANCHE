import { describe, expect, it } from 'vitest';
import { resolveMonthlyGoal, withGoalFrom, withMonthlyGoal } from './goals';
import { m } from '../test/helpers';
import type { MonthlyGoal } from './types';

const goal = (year: number, month: number, amount: number): MonthlyGoal => ({
  id: `${year}-${String(month).padStart(2, '0')}`,
  year,
  month,
  amount: m(amount),
});

describe('resolveMonthlyGoal', () => {
  const goals = [goal(2026, 8, 2500), goal(2026, 9, 3000)];

  it('uses the goal set for that exact month', () => {
    expect(resolveMonthlyGoal(goals, { year: 2026, month: 8 }, m(1))).toEqual({ amount: m(2500), source: 'explicit' });
  });

  it('carries the previous goal forward into months without one', () => {
    expect(resolveMonthlyGoal(goals, { year: 2026, month: 10 }, m(1))).toEqual({ amount: m(3000), source: 'inherited' });
    expect(resolveMonthlyGoal(goals, { year: 2027, month: 6 }, m(1))).toEqual({ amount: m(3000), source: 'inherited' });
  });

  it('a change in one month never alters earlier months', () => {
    const changed = withMonthlyGoal(goals, { year: 2026, month: 10 }, m(4000));
    expect(resolveMonthlyGoal(changed, { year: 2026, month: 9 }, 0).amount).toBe(m(3000));
    expect(resolveMonthlyGoal(changed, { year: 2026, month: 11 }, 0).amount).toBe(m(4000));
  });

  it('months before the first goal show that first goal; the default only applies with no goals at all', () => {
    expect(resolveMonthlyGoal(goals, { year: 2026, month: 7 }, m(1200))).toEqual({ amount: m(2500), source: 'inherited' });
    expect(resolveMonthlyGoal([], { year: 2026, month: 7 }, m(1200))).toEqual({ amount: m(1200), source: 'default' });
    expect(resolveMonthlyGoal([], { year: 2026, month: 7 }, 0)).toEqual({ amount: 0, source: 'default' });
  });

  it('an explicit 0 means "no goal" and is inherited too', () => {
    const noGoal = withMonthlyGoal(goals, { year: 2026, month: 10 }, 0);
    expect(resolveMonthlyGoal(noGoal, { year: 2026, month: 11 }, m(5000)).amount).toBe(0);
  });
});

describe('withMonthlyGoal', () => {
  it('replaces rather than duplicates, and keeps months sorted', () => {
    const list = withMonthlyGoal([goal(2026, 9, 3000)], { year: 2026, month: 3 }, m(100));
    expect(list.map((g) => g.id)).toEqual(['2026-03', '2026-09']);
    expect(withMonthlyGoal(list, { year: 2026, month: 9 }, m(3500))).toHaveLength(2);
  });
});

describe('withGoalFrom — changing a goal never rewrites the past', () => {
  const SEPT = { year: 2026, month: 9 };
  const AUG = { year: 2026, month: 8 };

  it('freezes what earlier months were showing before changing the first goal', () => {
    const before = [goal(2026, 9, 3000)];
    const after = withGoalFrom(before, SEPT, m(4000), m(3000));
    expect(resolveMonthlyGoal(after, SEPT, 0).amount).toBe(m(4000));
    expect(resolveMonthlyGoal(after, AUG, 0).amount).toBe(m(3000));
    expect(resolveMonthlyGoal(after, { year: 2025, month: 1 }, 0).amount).toBe(m(3000));
    expect(resolveMonthlyGoal(after, { year: 2027, month: 1 }, 0).amount).toBe(m(4000));
  });

  it('with no goals yet, earlier months keep the old default (including "no goal")', () => {
    const after = withGoalFrom([], SEPT, m(3000), 0);
    expect(resolveMonthlyGoal(after, AUG, m(3000)).amount).toBe(0);
    expect(resolveMonthlyGoal(after, SEPT, 0).amount).toBe(m(3000));
  });

  it('does nothing extra when an earlier goal already protects the past, or nothing changes', () => {
    const existing = [goal(2026, 6, 2000)];
    expect(withGoalFrom(existing, SEPT, m(4000), 0)).toHaveLength(2);
    const same = withGoalFrom([goal(2026, 9, 3000)], SEPT, m(3000), m(3000));
    expect(same).toHaveLength(1);
  });
});
