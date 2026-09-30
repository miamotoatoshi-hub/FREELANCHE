import { describe, expect, it } from 'vitest';
import { dataWith, entry, m, testDeps } from '../test/helpers';
import { resolveMonthlyGoal } from './goals';
import {
  addIncome,
  changeCurrency,
  completeOnboarding,
  createInitialData,
  deleteIncome,
  importEntries,
  setDefaultGoal,
  setMonthGoal,
  updateIncome,
} from './usecases';

const SEPT = { year: 2026, month: 9 };

describe('addIncome', () => {
  it('adds a validated entry with timestamps and the current currency', () => {
    const result = addIncome(dataWith([]), { amount: m(150), date: '2026-09-30', note: '  Design   project ' }, testDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry).toMatchObject({
      amount: m(150),
      currency: 'EUR',
      date: '2026-09-30',
      note: 'Design project',
      createdAt: '2026-09-30T12:00:00.000Z',
      updatedAt: '2026-09-30T12:00:00.000Z',
    });
    expect(result.value.data.entries).toHaveLength(1);
  });

  it('keeps the calendar date exactly as chosen (no time-zone shift)', () => {
    const late = testDeps('2026-09-30T23:59:59.000Z');
    const result = addIncome(dataWith([]), { amount: m(10), date: '2026-09-30' }, late);
    expect(result.ok && result.value.entry.date).toBe('2026-09-30');
  });

  it('does not require a note', () => {
    const result = addIncome(dataWith([]), { amount: m(10), date: '2026-09-30', note: '   ' }, testDeps());
    expect(result.ok && 'note' in result.value.entry).toBe(false);
  });

  it.each([
    [0, 'amount-not-positive'],
    [-100, 'amount-not-positive'],
    [Number.NaN, 'amount-invalid'],
    [Number.POSITIVE_INFINITY, 'amount-invalid'],
    [12.5, 'amount-invalid'],
    [m(100_000_001), 'amount-too-large'],
  ])('rejects amount %s', (amount, error) => {
    const result = addIncome(dataWith([]), { amount, date: '2026-09-30' }, testDeps());
    expect(result).toEqual({ ok: false, error });
  });

  it('rejects an invalid date and an over-long note', () => {
    expect(addIncome(dataWith([]), { amount: m(1), date: '2026-02-30' }, testDeps())).toEqual({ ok: false, error: 'date-invalid' });
    expect(addIncome(dataWith([]), { amount: m(1), date: '2026-09-30', note: 'x'.repeat(500) }, testDeps())).toEqual({
      ok: false,
      error: 'note-too-long',
    });
  });

  it('ignores a duplicate submission of the same draft id', () => {
    const first = addIncome(dataWith([]), { id: 'draft-1', amount: m(100), date: '2026-09-30' }, testDeps());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addIncome(first.value.data, { id: 'draft-1', amount: m(100), date: '2026-09-30' }, testDeps());
    expect(second.ok && second.value.data.entries).toHaveLength(1);
  });

  it('allows several entries on the same day', () => {
    let data = dataWith([]);
    const deps = testDeps();
    for (const amount of [100, 200, 300]) {
      const result = addIncome(data, { amount: m(amount), date: '2026-09-30' }, deps);
      if (result.ok) data = result.value.data;
    }
    expect(data.entries).toHaveLength(3);
    expect(new Set(data.entries.map((e) => e.id)).size).toBe(3);
  });

  it('does not mutate the input data', () => {
    const data = dataWith([entry('2026-09-01', 5)]);
    const snapshot = JSON.stringify(data);
    addIncome(data, { amount: m(1), date: '2026-09-30' }, testDeps());
    expect(JSON.stringify(data)).toBe(snapshot);
  });
});

describe('updateIncome', () => {
  it('changes amount, date and note, keeping id and createdAt but bumping updatedAt', () => {
    const original = entry('2026-09-01', 100, { note: 'old', createdAt: '2026-09-01T10:00:00.000Z' });
    const result = updateIncome(dataWith([original]), original.id, { amount: m(250), date: '2026-09-02' }, testDeps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const updated = result.value.entries[0]!;
    expect(updated).toMatchObject({ id: original.id, amount: m(250), date: '2026-09-02', createdAt: '2026-09-01T10:00:00.000Z' });
    expect(updated.updatedAt).toBe('2026-09-30T12:00:00.000Z');
    expect('note' in updated).toBe(false); // note cleared
  });

  it('fails cleanly for unknown ids and invalid input', () => {
    expect(updateIncome(dataWith([]), 'nope', { amount: m(1), date: '2026-09-01' }, testDeps())).toEqual({ ok: false, error: 'not-found' });
    const e = entry('2026-09-01', 1);
    expect(updateIncome(dataWith([e]), e.id, { amount: 0, date: '2026-09-01' }, testDeps()).ok).toBe(false);
  });
});

describe('deleteIncome', () => {
  it('removes only the chosen entry', () => {
    const a = entry('2026-09-01', 1);
    const b = entry('2026-09-01', 2);
    const result = deleteIncome(dataWith([a, b]), a.id);
    expect(result.ok && result.value.entries.map((e) => e.id)).toEqual([b.id]);
    expect(deleteIncome(dataWith([a]), 'missing')).toEqual({ ok: false, error: 'not-found' });
  });
});

describe('goals', () => {
  it('setMonthGoal changes one month and never touches entries', () => {
    const data = dataWith([entry('2026-09-01', 100)]);
    const result = setMonthGoal(data, SEPT, m(4000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entries).toBe(data.entries);
    expect(resolveMonthlyGoal(result.value.goals, SEPT, 0).amount).toBe(m(4000));
  });

  it('setDefaultGoal applies from the current month and leaves earlier months alone', () => {
    let data = dataWith([]);
    const aug = setMonthGoal(data, { year: 2026, month: 8 }, m(2500));
    if (aug.ok) data = aug.value;
    const result = setDefaultGoal(data, m(4000), SEPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.defaultMonthlyGoal).toBe(m(4000));
    expect(resolveMonthlyGoal(result.value.goals, { year: 2026, month: 8 }, m(4000)).amount).toBe(m(2500));
    expect(resolveMonthlyGoal(result.value.goals, SEPT, 0).amount).toBe(m(4000));
    expect(resolveMonthlyGoal(result.value.goals, { year: 2026, month: 12 }, 0).amount).toBe(m(4000));
  });

  it('rejects negative or absurd goals but allows 0 (no goal)', () => {
    expect(setMonthGoal(dataWith([]), SEPT, -1)).toEqual({ ok: false, error: 'goal-invalid' });
    expect(setMonthGoal(dataWith([]), SEPT, Number.NaN)).toEqual({ ok: false, error: 'goal-invalid' });
    expect(setMonthGoal(dataWith([]), SEPT, 0).ok).toBe(true);
  });
});

describe('changeCurrency', () => {
  it('keeps every amount and only relabels the currency — no conversion', () => {
    const data = dataWith([entry('2026-09-01', 1234.56)]);
    const result = changeCurrency(data, 'USD');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.currency).toBe('USD');
    expect(result.value.entries[0]).toMatchObject({ amount: m(1234.56), currency: 'USD' });
  });

  it('rejects malformed codes', () => {
    expect(changeCurrency(dataWith([]), 'usd')).toEqual({ ok: false, error: 'currency-invalid' });
    expect(changeCurrency(dataWith([]), '')).toEqual({ ok: false, error: 'currency-invalid' });
  });
});

describe('completeOnboarding', () => {
  it('saves currency, goal and the completed flag', () => {
    const result = completeOnboarding(createInitialData(), { goal: m(3000), currency: 'GBP' }, SEPT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings).toMatchObject({ currency: 'GBP', defaultMonthlyGoal: m(3000), onboardingCompleted: true });
    expect(resolveMonthlyGoal(result.value.goals, SEPT, 0).amount).toBe(m(3000));
  });
});

describe('importEntries', () => {
  const rows = [
    { date: '2026-09-01', amount: m(150), note: 'Website' },
    { date: '2026-09-03', amount: m(300) },
  ];

  it('adds new rows and never touches existing entries', () => {
    const existing = entry('2026-08-01', 50);
    const outcome = importEntries(dataWith([existing]), rows, testDeps());
    expect(outcome.added).toBe(2);
    expect(outcome.data.entries).toHaveLength(3);
    expect(outcome.data.entries[0]).toBe(existing);
  });

  it('skips rows identical to existing entries, so re-importing is harmless', () => {
    const once = importEntries(dataWith([]), rows, testDeps());
    const twice = importEntries(once.data, rows, testDeps());
    expect(twice.added).toBe(0);
    expect(twice.duplicates).toBe(2);
    expect(twice.data.entries).toHaveLength(2);
  });

  it('keeps two genuinely identical rows from one file', () => {
    const doubled = [rows[0]!, rows[0]!];
    expect(importEntries(dataWith([]), doubled, testDeps()).added).toBe(2);
  });
});
