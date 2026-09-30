import { fromMajor } from '../domain/money';
import type { AppData, IncomeEntry, LocalDate } from '../domain/types';
import { createInitialData, type UseCaseDeps } from '../domain/usecases';

/** Shorthand: `m(150)` is €150 in stored units. */
export const m = fromMajor;

let counter = 0;

export function entry(date: LocalDate, majorAmount: number, extra: Partial<IncomeEntry> = {}): IncomeEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    amount: m(majorAmount),
    currency: 'EUR',
    date,
    createdAt: `2026-01-01T00:00:${String(counter % 60).padStart(2, '0')}.000Z`,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

export function dataWith(entries: IncomeEntry[], patch: Partial<AppData['settings']> = {}): AppData {
  const base = createInitialData({ onboardingCompleted: true, defaultMonthlyGoal: m(3000), ...patch });
  return { ...base, entries };
}

export function testDeps(now = '2026-09-30T12:00:00.000Z'): UseCaseDeps {
  let n = 0;
  return { now: () => new Date(now), newId: () => `id-${(n += 1)}` };
}
