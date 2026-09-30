import { describe, expect, it } from 'vitest';
import { dataWith, entry, m } from '../test/helpers';
import { BACKUP_KEY, createLocalPersistence, createMemoryStorage, STORAGE_KEY, THEME_KEY } from './persistence';
import { parseAppData } from './schema';

describe('persistence', () => {
  it('reports a fresh install when nothing is stored', () => {
    expect(createLocalPersistence(createMemoryStorage()).load()).toEqual({ status: 'fresh' });
  });

  it('round-trips data exactly', () => {
    const storage = createMemoryStorage();
    const persistence = createLocalPersistence(storage);
    const data = dataWith([entry('2026-09-01', 125.5, { note: 'Logo' }), entry('2026-09-02', 40)]);
    persistence.save(data);
    const loaded = persistence.load();
    expect(loaded.status === 'ok' && loaded.data).toEqual(data);
  });

  it('keeps a backup and reports corruption for unreadable text, without touching the original', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{"entries": [oops');
    const persistence = createLocalPersistence(storage);
    expect(persistence.load()).toEqual({ status: 'corrupt' });
    expect(storage.getItem(BACKUP_KEY)).toBe('{"entries": [oops');
    expect(storage.getItem(STORAGE_KEY)).toBe('{"entries": [oops');
  });

  it('treats a JSON value that is not an object as corrupt', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '[1,2,3]');
    expect(createLocalPersistence(storage).load()).toEqual({ status: 'corrupt' });
  });

  it('clear() removes every key the app owns and nothing else', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, '{}');
    storage.setItem(BACKUP_KEY, 'x');
    storage.setItem(THEME_KEY, 'dark');
    storage.setItem('someone-else', 'keep');
    createLocalPersistence(storage).clear();
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
    expect(storage.getItem(THEME_KEY)).toBeNull();
    expect(storage.getItem('someone-else')).toBe('keep');
  });

  it('works in memory (not durable) when the browser gives no storage', () => {
    const persistence = createLocalPersistence(null);
    expect(persistence.durable).toBe(false);
    persistence.save(dataWith([entry('2026-09-01', 5)]));
    expect(persistence.load().status).toBe('ok');
  });
});

describe('parseAppData', () => {
  const good = entry('2026-09-01', 100);

  it('drops unusable records and counts them instead of failing', () => {
    const raw = {
      schemaVersion: 1,
      settings: { currency: 'EUR', onboardingCompleted: true },
      entries: [
        good,
        { ...good, id: 'bad-amount', amount: -5 },
        { ...good, id: 'bad-date', date: '2026-02-30' },
        { ...good, id: 'nan', amount: Number.NaN },
        { ...good, id: 'float', amount: 10.5 },
        { ...good, id: '' },
        { ...good }, // duplicate id
        'garbage',
        null,
      ],
      goals: [{ id: 'x', year: 2026, month: 9, amount: m(3000) }, { year: 2026, month: 13, amount: 1 }, { year: 2026, month: 5, amount: -1 }],
    };
    const parsed = parseAppData(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.data.entries).toEqual([good]);
    expect(parsed!.data.goals).toEqual([{ id: '2026-09', year: 2026, month: 9, amount: m(3000) }]);
    expect(parsed!.dropped).toBe(8 + 2);
  });

  it('repairs missing or wrong-typed settings with defaults', () => {
    const parsed = parseAppData({ settings: { currency: 'euro', theme: 'purple', defaultMonthlyGoal: 'lots', onboardingCompleted: 'yes' } });
    expect(parsed!.data.settings).toEqual({
      currency: 'EUR',
      defaultMonthlyGoal: 0,
      theme: 'system',
      onboardingCompleted: false,
      language: 'en',
    });
  });

  it('fills a missing currency on an entry and trims notes', () => {
    const parsed = parseAppData({
      settings: { currency: 'USD' },
      entries: [{ ...good, currency: undefined, note: '   hello  ' }],
    });
    expect(parsed!.data.entries[0]).toMatchObject({ currency: 'USD', note: 'hello' });
  });

  it('rejects non-objects', () => {
    expect(parseAppData(null)).toBeNull();
    expect(parseAppData('text')).toBeNull();
    expect(parseAppData([])).toBeNull();
  });
});
