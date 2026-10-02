import { addMonths, clampMonth, compareMonths, monthOf, todayLocal } from '../domain/dates';
import {
  addIncome,
  changeCurrency,
  completeOnboarding,
  createInitialData,
  deleteIncome,
  importEntries,
  setDefaultGoal,
  setMonthGoal,
  setName,
  updateIncome,
  updateSettings,
  type ImportRow,
  type IncomeInput,
  type UseCaseDeps,
} from '../domain/usecases';
import {
  fail,
  ok,
  type AppData,
  type IncomeEntry,
  type LocalDate,
  type Result,
  type ThemePreference,
  type UserSettings,
  type YearMonth,
} from '../domain/types';
import type { Persistence } from '../data/persistence';

/**
 * The single source of truth at runtime. Components subscribe to slices of it;
 * every mutation is: run a pure use case → persist → publish. If persisting
 * fails nothing is published, so the screen never shows data that isn't saved.
 */

export interface AppSnapshot {
  /** `error` when saved data exists but could not be read. */
  status: 'ready' | 'error';
  data: AppData;
  selectedMonth: YearMonth;
  today: LocalDate;
  /** False when the browser refused storage and data lives in memory only. */
  durable: boolean;
}

export interface StoreDeps extends UseCaseDeps {
  /** Settings to start with on a fresh install (language and currency guessed from the device). */
  defaults: Partial<UserSettings>;
}

type Listener = () => void;

export class AppStore {
  private snapshot: AppSnapshot;
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly persistence: Persistence,
    private readonly deps: StoreDeps,
  ) {
    const today = todayLocal(deps.now());
    const loaded = persistence.load();
    this.snapshot = {
      status: loaded.status === 'corrupt' ? 'error' : 'ready',
      data: loaded.status === 'ok' ? loaded.data : createInitialData(deps.defaults),
      selectedMonth: monthOf(today),
      today,
      durable: persistence.durable,
    };
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AppSnapshot => this.snapshot;

  private publish(patch: Partial<AppSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  /** Persist first, then publish. */
  private commit(next: AppData): Result<void> {
    if (next === this.snapshot.data) return ok(undefined);
    try {
      this.persistence.save(next);
    } catch {
      return fail('save-failed');
    }
    this.publish({ data: next });
    return ok(undefined);
  }

  private apply(result: Result<AppData>): Result<void> {
    return result.ok ? this.commit(result.value) : result;
  }

  private get currentMonth(): YearMonth {
    return monthOf(this.snapshot.today);
  }

  // ── income ────────────────────────────────────────────────────────────────

  addIncome(input: IncomeInput): Result<IncomeEntry> {
    const result = addIncome(this.snapshot.data, input, this.deps);
    if (!result.ok) return result;
    const saved = this.commit(result.value.data);
    return saved.ok ? ok(result.value.entry) : saved;
  }

  updateIncome(id: string, input: Omit<IncomeInput, 'id'>): Result<void> {
    return this.apply(updateIncome(this.snapshot.data, id, input, this.deps));
  }

  deleteIncome(id: string): Result<void> {
    return this.apply(deleteIncome(this.snapshot.data, id));
  }

  importRows(rows: readonly ImportRow[]): Result<{ added: number; duplicates: number }> {
    const outcome = importEntries(this.snapshot.data, rows, this.deps);
    const saved = this.commit(outcome.data);
    return saved.ok ? ok({ added: outcome.added, duplicates: outcome.duplicates }) : saved;
  }

  // ── goals & settings ──────────────────────────────────────────────────────

  setMonthGoal(ym: YearMonth, amount: number): Result<void> {
    return this.apply(setMonthGoal(this.snapshot.data, ym, amount));
  }

  /** "From this month on" goal used by Settings and onboarding. */
  setGoalFromNow(amount: number): Result<void> {
    return this.apply(setDefaultGoal(this.snapshot.data, amount, this.currentMonth));
  }

  changeCurrency(currency: string): Result<void> {
    return this.apply(changeCurrency(this.snapshot.data, currency));
  }

  setName(name: string): Result<void> {
    return this.apply(setName(this.snapshot.data, name));
  }

  setTheme(theme: ThemePreference): Result<void> {
    return this.commit(updateSettings(this.snapshot.data, { theme }));
  }

  setLanguage(language: string): Result<void> {
    return this.commit(updateSettings(this.snapshot.data, { language }));
  }

  completeOnboarding(input: { goal: number; currency: string }): Result<void> {
    return this.apply(completeOnboarding(this.snapshot.data, input, this.currentMonth));
  }

  /** Erases everything and returns to a clean first-launch state. */
  deleteAllData(): Result<void> {
    try {
      this.persistence.clear();
    } catch {
      return fail('save-failed');
    }
    const { language, theme } = this.snapshot.data.settings;
    this.publish({
      status: 'ready',
      data: createInitialData({ ...this.deps.defaults, language, theme }),
      selectedMonth: this.currentMonth,
    });
    return ok(undefined);
  }

  // ── navigation through time ───────────────────────────────────────────────

  selectMonth(ym: YearMonth): void {
    const next = clampMonth(ym, this.snapshot.today);
    if (compareMonths(next, this.snapshot.selectedMonth) !== 0) this.publish({ selectedMonth: next });
  }

  stepMonth(delta: number): void {
    this.selectMonth(addMonths(this.snapshot.selectedMonth, delta));
  }

  /** Call when the app returns to the foreground or midnight passes (also covers time-zone changes). */
  syncToday(): void {
    const today = todayLocal(this.deps.now());
    if (today === this.snapshot.today) return;
    const wasOnCurrent = compareMonths(this.snapshot.selectedMonth, monthOf(this.snapshot.today)) === 0;
    this.publish({ today, ...(wasOnCurrent ? { selectedMonth: monthOf(today) } : {}) });
  }

  // ── recovery ──────────────────────────────────────────────────────────────

  /** Re-reads storage (after an error, or when another tab changed the data). */
  reload(): void {
    const loaded = this.persistence.load();
    if (loaded.status === 'corrupt') {
      this.publish({ status: 'error' });
    } else {
      this.publish({
        status: 'ready',
        data: loaded.status === 'ok' ? loaded.data : createInitialData(this.deps.defaults),
      });
    }
  }

  /** Leaves the unreadable data behind (a backup copy exists) and starts clean. */
  startFresh(): void {
    this.persistence.discard();
    this.publish({ status: 'ready', data: createInitialData(this.deps.defaults) });
  }

  watchOtherTabs(): () => void {
    return this.persistence.watch(() => this.reload());
  }
}
