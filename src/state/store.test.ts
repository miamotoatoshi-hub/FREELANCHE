import { describe, expect, it } from 'vitest';
import { createLocalPersistence, createMemoryStorage, STORAGE_KEY, type Persistence } from '../data/persistence';
import { calculateMonthlyIncome } from '../domain/calculations';
import { m } from '../test/helpers';
import { AppStore } from './store';

function makeStore(options: { now?: string; persistence?: Persistence } = {}) {
  const storage = createMemoryStorage();
  const persistence = options.persistence ?? createLocalPersistence(storage);
  let n = 0;
  let clock = new Date(options.now ?? '2026-09-30T12:00:00');
  const store = new AppStore(persistence, {
    now: () => clock,
    newId: () => `id-${(n += 1)}`,
    defaults: { currency: 'EUR', language: 'en' },
  });
  return { store, storage, persistence, setClock: (iso: string) => (clock = new Date(iso)) };
}

const SEPT = { year: 2026, month: 9 };

describe('AppStore', () => {
  it('starts in first-launch state on the current month', () => {
    const { store } = makeStore();
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.data.settings.onboardingCompleted).toBe(false);
    expect(snapshot.selectedMonth).toEqual(SEPT);
    expect(snapshot.today).toBe('2026-09-30');
  });

  it('runs the whole journey and survives a restart', () => {
    const first = makeStore();
    expect(first.store.completeOnboarding({ goal: m(3000), currency: 'USD' }).ok).toBe(true);
    const added = first.store.addIncome({ amount: m(500), date: '2026-09-30', note: 'Website' });
    expect(added.ok).toBe(true);

    // "Restart": a brand-new store over the same storage.
    const second = makeStore({ persistence: createLocalPersistence(first.storage) });
    const data = second.store.getSnapshot().data;
    expect(data.settings).toMatchObject({ onboardingCompleted: true, currency: 'USD', defaultMonthlyGoal: m(3000) });
    expect(calculateMonthlyIncome(data.entries, SEPT)).toBe(m(500));

    // Edit, then delete — both persist.
    const id = data.entries[0]!.id;
    expect(second.store.updateIncome(id, { amount: m(750), date: '2026-09-30' }).ok).toBe(true);
    const third = makeStore({ persistence: createLocalPersistence(first.storage) });
    expect(third.store.getSnapshot().data.entries[0]!.amount).toBe(m(750));
    expect(third.store.deleteIncome(id).ok).toBe(true);
    const fourth = makeStore({ persistence: createLocalPersistence(first.storage) });
    expect(fourth.store.getSnapshot().data.entries).toEqual([]);
  });

  it('notifies subscribers only when something changed', () => {
    const { store } = makeStore();
    let calls = 0;
    store.subscribe(() => (calls += 1));
    store.addIncome({ amount: m(10), date: '2026-09-30' });
    expect(calls).toBe(1);
    store.selectMonth(SEPT); // no change
    expect(calls).toBe(1);
    store.stepMonth(-1);
    expect(calls).toBe(2);
  });

  it('never publishes data that failed to save', () => {
    const storage = createMemoryStorage();
    const real = createLocalPersistence(storage);
    const failing: Persistence = {
      ...real,
      save: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    };
    const { store } = makeStore({ persistence: failing });
    const result = store.addIncome({ amount: m(10), date: '2026-09-30' });
    expect(result).toEqual({ ok: false, error: 'save-failed' });
    expect(store.getSnapshot().data.entries).toHaveLength(0);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('returns validation errors without touching storage', () => {
    const { store, storage } = makeStore();
    expect(store.addIncome({ amount: 0, date: '2026-09-30' })).toEqual({ ok: false, error: 'amount-not-positive' });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('a double-tapped submit adds one entry', () => {
    const { store } = makeStore();
    store.addIncome({ id: 'draft', amount: m(10), date: '2026-09-30' });
    store.addIncome({ id: 'draft', amount: m(10), date: '2026-09-30' });
    expect(store.getSnapshot().data.entries).toHaveLength(1);
  });

  it('keeps month navigation within bounds', () => {
    const { store } = makeStore();
    for (let i = 0; i < 100; i += 1) store.stepMonth(1);
    expect(store.getSnapshot().selectedMonth).toEqual({ year: 2028, month: 9 });
    for (let i = 0; i < 400; i += 1) store.stepMonth(-1);
    expect(store.getSnapshot().selectedMonth).toEqual({ year: 2000, month: 1 });
  });

  it('follows the calendar when the day changes, including a time-zone change', () => {
    const { store, setClock } = makeStore();
    setClock('2026-10-01T00:05:00');
    store.syncToday();
    expect(store.getSnapshot().today).toBe('2026-10-01');
    expect(store.getSnapshot().selectedMonth).toEqual({ year: 2026, month: 10 });
  });

  it('does not yank the user away from a month they navigated to', () => {
    const { store, setClock } = makeStore();
    store.stepMonth(-3);
    setClock('2026-10-01T00:05:00');
    store.syncToday();
    expect(store.getSnapshot().selectedMonth).toEqual({ year: 2026, month: 6 });
  });

  it('delete all data clears storage and returns to first launch, keeping language and theme', () => {
    const { store, storage } = makeStore();
    store.completeOnboarding({ goal: m(1000), currency: 'GBP' });
    store.setLanguage('ru');
    store.addIncome({ amount: m(10), date: '2026-09-30' });
    expect(store.deleteAllData().ok).toBe(true);
    const snapshot = store.getSnapshot();
    expect(snapshot.data.entries).toEqual([]);
    expect(snapshot.data.goals).toEqual([]);
    expect(snapshot.data.settings).toMatchObject({ onboardingCompleted: false, currency: 'EUR', defaultMonthlyGoal: 0, language: 'ru' });
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('shows an error state for unreadable data and can start fresh', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{nope');
    const { store } = makeStore({ persistence: createLocalPersistence(storage) });
    expect(store.getSnapshot().status).toBe('error');
    store.startFresh();
    expect(store.getSnapshot().status).toBe('ready');
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('changing currency relabels without changing amounts', () => {
    const { store } = makeStore();
    store.completeOnboarding({ goal: m(1000), currency: 'EUR' });
    store.addIncome({ amount: m(123.45), date: '2026-09-30' });
    store.changeCurrency('JPY');
    const entry = store.getSnapshot().data.entries[0]!;
    expect(entry).toMatchObject({ amount: m(123.45), currency: 'JPY' });
  });
});
