/**
 * Core domain types. Nothing in `domain/` imports from React, the DOM or storage.
 */

/** A calendar date with no time zone, always formatted `YYYY-MM-DD`. */
export type LocalDate = string;

/** A calendar month. `month` is 1–12. */
export interface YearMonth {
  year: number;
  month: number;
}

/**
 * Money is stored as an integer number of hundredths of the currency's major
 * unit (see `STORAGE_SCALE` in `money.ts`) — never as a float. Using one scale
 * for every currency means changing the display currency never rewrites data.
 */
export interface IncomeEntry {
  id: string;
  amount: number;
  currency: string;
  /** The calendar date the user intended, independent of any time zone. */
  date: LocalDate;
  note?: string;
  /** ISO-8601 instants: when the record was created / last changed. */
  createdAt: string;
  updatedAt: string;
}

/** One goal per calendar month; `id` is `YYYY-MM`. Amount uses the same scale as income. */
export interface MonthlyGoal {
  id: string;
  year: number;
  month: number;
  amount: number;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  /** What the app calls the user. A nickname is fine; empty means "not set". */
  name: string;
  currency: string;
  /** Base goal, used for months that have no earlier goal to inherit from. 0 = no goal. */
  defaultMonthlyGoal: number;
  theme: ThemePreference;
  onboardingCompleted: boolean;
  language: string;
}

export interface AppData {
  schemaVersion: number;
  settings: UserSettings;
  entries: IncomeEntry[];
  goals: MonthlyGoal[];
}

export type AppState =
  | 'FirstLaunch'
  | 'Empty'
  | 'Active'
  | 'GoalReached'
  | 'GoalExceeded'
  | 'HistoricalMonth'
  | 'FutureMonth'
  | 'NoGoal'
  | 'Error';

/** Stable, machine-readable failure reasons. The UI maps them to friendly copy. */
export type ErrorCode =
  | 'amount-empty'
  | 'amount-invalid'
  | 'amount-not-positive'
  | 'amount-too-large'
  | 'amount-decimals'
  | 'date-invalid'
  | 'note-too-long'
  | 'name-too-long'
  | 'goal-invalid'
  | 'currency-invalid'
  | 'currency-required'
  | 'not-found'
  | 'save-failed';

export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(error: ErrorCode): Result<T> => ({ ok: false, error });
