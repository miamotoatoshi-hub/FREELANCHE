import { withGoalFrom } from './goals';
import {
  fail,
  ok,
  type AppData,
  type IncomeEntry,
  type LocalDate,
  type Result,
  type UserSettings,
  type YearMonth,
} from './types';
import { isValidCurrencyCode, validateAmount, validateIncomeFields } from './validation';

/**
 * Every change to the user's data goes through one of these pure functions:
 * `(data, input) → new data`. They validate, never mutate, and know nothing
 * about storage or React — the store persists whatever they return.
 */

export const SCHEMA_VERSION = 1;

export interface UseCaseDeps {
  now: () => Date;
  newId: () => string;
}

export const DEFAULT_SETTINGS: UserSettings = {
  currency: 'EUR',
  defaultMonthlyGoal: 0,
  theme: 'system',
  onboardingCompleted: false,
  language: 'en',
};

export function createInitialData(settings: Partial<UserSettings> = {}): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    entries: [],
    goals: [],
  };
}

export interface IncomeInput {
  /** Optional client-generated id; submitting the same id twice adds one entry. */
  id?: string;
  amount: number;
  date: LocalDate;
  note?: string;
}

export function addIncome(
  data: AppData,
  input: IncomeInput,
  deps: UseCaseDeps,
): Result<{ data: AppData; entry: IncomeEntry }> {
  const fields = validateIncomeFields(input);
  if (!fields.ok) return fail(fields.error);

  if (input.id) {
    // Duplicate submission (double tap, retry): keep the entry that already exists.
    const existing = data.entries.find((entry) => entry.id === input.id);
    if (existing) return ok({ data, entry: existing });
  }

  const timestamp = deps.now().toISOString();
  const entry: IncomeEntry = {
    id: input.id ?? deps.newId(),
    amount: fields.value.amount,
    currency: data.settings.currency,
    date: fields.value.date,
    ...(fields.value.note ? { note: fields.value.note } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return ok({ data: { ...data, entries: [...data.entries, entry] }, entry });
}

export function updateIncome(
  data: AppData,
  id: string,
  input: Omit<IncomeInput, 'id'>,
  deps: UseCaseDeps,
): Result<AppData> {
  const fields = validateIncomeFields(input);
  if (!fields.ok) return fail(fields.error);
  const index = data.entries.findIndex((entry) => entry.id === id);
  if (index === -1) return fail('not-found');

  const current = data.entries[index]!;
  const { note: _previousNote, ...rest } = current;
  const updated: IncomeEntry = {
    ...rest,
    amount: fields.value.amount,
    date: fields.value.date,
    ...(fields.value.note ? { note: fields.value.note } : {}),
    updatedAt: deps.now().toISOString(),
  };
  const entries = data.entries.slice();
  entries[index] = updated;
  return ok({ ...data, entries });
}

export function deleteIncome(data: AppData, id: string): Result<AppData> {
  if (!data.entries.some((entry) => entry.id === id)) return fail('not-found');
  return ok({ ...data, entries: data.entries.filter((entry) => entry.id !== id) });
}

/** Sets the goal for one month. 0 means "no goal for this month". */
export function setMonthGoal(data: AppData, ym: YearMonth, amount: number): Result<AppData> {
  if (validateAmount(amount, { allowZero: true })) return fail('goal-invalid');
  return ok({ ...data, goals: withGoalFrom(data.goals, ym, amount, data.settings.defaultMonthlyGoal) });
}

/**
 * Changes the everyday goal "from this month onward": updates the default and
 * pins it to the current month, so earlier months keep the goals they had.
 */
export function setDefaultGoal(data: AppData, amount: number, currentMonth: YearMonth): Result<AppData> {
  if (validateAmount(amount, { allowZero: true })) return fail('goal-invalid');
  return ok({
    ...data,
    settings: { ...data.settings, defaultMonthlyGoal: amount },
    goals: withGoalFrom(data.goals, currentMonth, amount, data.settings.defaultMonthlyGoal),
  });
}

/**
 * Switches the app's currency. Nothing is converted: every stored amount keeps
 * its number and simply carries the new currency label.
 */
export function changeCurrency(data: AppData, currency: string): Result<AppData> {
  if (!isValidCurrencyCode(currency)) return fail('currency-invalid');
  return ok({
    ...data,
    settings: { ...data.settings, currency },
    entries: data.entries.map((entry) => (entry.currency === currency ? entry : { ...entry, currency })),
  });
}

export function updateSettings(data: AppData, patch: Partial<UserSettings>): AppData {
  return { ...data, settings: { ...data.settings, ...patch } };
}

export function completeOnboarding(
  data: AppData,
  input: { goal: number; currency: string },
  currentMonth: YearMonth,
): Result<AppData> {
  const withCurrency = changeCurrency(data, input.currency);
  if (!withCurrency.ok) return withCurrency;
  const withGoal = setDefaultGoal(withCurrency.value, input.goal, currentMonth);
  if (!withGoal.ok) return withGoal;
  return ok(updateSettings(withGoal.value, { onboardingCompleted: true }));
}

export interface ImportRow {
  date: LocalDate;
  amount: number;
  note?: string;
}

export interface ImportOutcome {
  data: AppData;
  added: number;
  duplicates: number;
}

const importKey = (date: string, amount: number, note: string | undefined) => `${date}|${amount}|${note ?? ''}`;

/**
 * Adds imported rows as new entries. Nothing existing is changed or removed;
 * rows identical to an existing entry (same date, amount and note) are skipped,
 * so importing the same file twice is harmless.
 */
export function importEntries(data: AppData, rows: readonly ImportRow[], deps: UseCaseDeps): ImportOutcome {
  const seen = new Map<string, number>();
  for (const entry of data.entries) {
    const key = importKey(entry.date, entry.amount, entry.note);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  const timestamp = deps.now().toISOString();
  const added: IncomeEntry[] = [];
  let duplicates = 0;
  for (const row of rows) {
    const fields = validateIncomeFields(row);
    if (!fields.ok) continue;
    const key = importKey(fields.value.date, fields.value.amount, fields.value.note);
    const remaining = seen.get(key) ?? 0;
    if (remaining > 0) {
      seen.set(key, remaining - 1);
      duplicates += 1;
      continue;
    }
    added.push({
      id: deps.newId(),
      amount: fields.value.amount,
      currency: data.settings.currency,
      date: fields.value.date,
      ...(fields.value.note ? { note: fields.value.note } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
  return { data: added.length ? { ...data, entries: [...data.entries, ...added] } : data, added: added.length, duplicates };
}
