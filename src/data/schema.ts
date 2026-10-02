import { goalId } from '../domain/goals';
import { isValidLocalDate } from '../domain/dates';
import type { AppData, IncomeEntry, MonthlyGoal, ThemePreference, UserSettings } from '../domain/types';
import { createInitialData, DEFAULT_SETTINGS, SCHEMA_VERSION } from '../domain/usecases';
import { isValidCurrencyCode, MAX_NOTE_LENGTH, normalizeName, validateAmount } from '../domain/validation';

/**
 * Turns whatever was found in storage into trusted `AppData`. Anything that does
 * not pass validation is dropped and counted rather than trusted — a hand-edited
 * or damaged record can never crash the app or skew the totals.
 */

export interface ParsedData {
  data: AppData;
  /** Entries or goals that were unusable and left out. */
  dropped: number;
}

const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isTimestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function parseSettings(raw: unknown): UserSettings {
  const source = isRecord(raw) ? raw : {};
  const name = normalizeName(source.name);
  return {
    // Older saved data has no name; an unusable one is simply dropped.
    name: name.ok ? name.value : DEFAULT_SETTINGS.name,
    currency: isValidCurrencyCode(source.currency) ? source.currency : DEFAULT_SETTINGS.currency,
    defaultMonthlyGoal:
      validateAmount(source.defaultMonthlyGoal, { allowZero: true }) === null
        ? (source.defaultMonthlyGoal as number)
        : DEFAULT_SETTINGS.defaultMonthlyGoal,
    theme: THEMES.includes(source.theme as ThemePreference) ? (source.theme as ThemePreference) : DEFAULT_SETTINGS.theme,
    onboardingCompleted: source.onboardingCompleted === true,
    language: typeof source.language === 'string' && source.language ? source.language : DEFAULT_SETTINGS.language,
  };
}

function parseEntry(raw: unknown, fallbackCurrency: string): IncomeEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  if (validateAmount(raw.amount) !== null) return null;
  if (!isValidLocalDate(raw.date)) return null;

  const created = isTimestamp(raw.createdAt) ? raw.createdAt : `${raw.date}T00:00:00.000Z`;
  const updated = isTimestamp(raw.updatedAt) ? raw.updatedAt : created;
  const note = typeof raw.note === 'string' ? raw.note.trim().slice(0, MAX_NOTE_LENGTH) : '';
  return {
    id: raw.id,
    amount: raw.amount as number,
    currency: isValidCurrencyCode(raw.currency) ? raw.currency : fallbackCurrency,
    date: raw.date,
    ...(note ? { note } : {}),
    createdAt: created,
    updatedAt: updated,
  };
}

function parseGoal(raw: unknown): MonthlyGoal | null {
  if (!isRecord(raw)) return null;
  const { year, month, amount } = raw;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return null;
  if (validateAmount(amount, { allowZero: true }) !== null) return null;
  return { id: goalId({ year, month }), year, month, amount: amount as number };
}

export function parseAppData(raw: unknown): ParsedData | null {
  if (!isRecord(raw)) return null;

  const settings = parseSettings(raw.settings);
  const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
  const rawGoals = Array.isArray(raw.goals) ? raw.goals : [];

  let dropped = 0;
  const seenIds = new Set<string>();
  const entries: IncomeEntry[] = [];
  for (const item of rawEntries) {
    const entry = parseEntry(item, settings.currency);
    if (!entry || seenIds.has(entry.id)) {
      dropped += 1;
      continue;
    }
    seenIds.add(entry.id);
    entries.push(entry);
  }

  const goalsById = new Map<string, MonthlyGoal>();
  for (const item of rawGoals) {
    const goal = parseGoal(item);
    if (!goal) {
      dropped += 1;
      continue;
    }
    goalsById.set(goal.id, goal);
  }
  const goals = [...goalsById.values()].sort((a, b) => a.year - b.year || a.month - b.month);

  return { data: { ...createInitialData(settings), schemaVersion: SCHEMA_VERSION, entries, goals }, dropped };
}
