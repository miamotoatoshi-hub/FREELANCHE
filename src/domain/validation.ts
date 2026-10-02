import { isValidLocalDate } from './dates';
import { MAX_AMOUNT } from './money';
import { fail, ok, type ErrorCode, type LocalDate, type Result } from './types';

export const MAX_NOTE_LENGTH = 120;
export const MAX_NAME_LENGTH = 40;

/** Checks a stored amount is a usable positive integer within limits. */
export function validateAmount(amount: unknown, { allowZero = false } = {}): ErrorCode | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return 'amount-invalid';
  if (!Number.isInteger(amount)) return 'amount-invalid';
  if (amount < 0 || (!allowZero && amount === 0)) return 'amount-not-positive';
  if (amount > MAX_AMOUNT) return 'amount-too-large';
  return null;
}

/** Trims a note; empty means "no note". */
export function normalizeNote(note: unknown): Result<string | undefined> {
  if (note === undefined || note === null) return ok(undefined);
  if (typeof note !== 'string') return fail('note-too-long');
  const trimmed = note.replace(/\s+/g, ' ').trim();
  if (trimmed.length > MAX_NOTE_LENGTH) return fail('note-too-long');
  return ok(trimmed === '' ? undefined : trimmed);
}

export interface IncomeFields {
  amount: number;
  date: LocalDate;
  note?: string;
}

export function validateIncomeFields(input: {
  amount: unknown;
  date: unknown;
  note?: unknown;
}): Result<IncomeFields> {
  const amountError = validateAmount(input.amount);
  if (amountError) return fail(amountError);
  if (!isValidLocalDate(input.date)) return fail('date-invalid');
  const note = normalizeNote(input.note);
  if (!note.ok) return fail(note.error);
  return ok({ amount: input.amount as number, date: input.date, ...(note.value ? { note: note.value } : {}) });
}

export const isValidCurrencyCode = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{3}$/.test(value);

/** Control characters and explicit bidi overrides: never useful in a name, and they can scramble the text around it. */
const UNSAFE_NAME_CHARS = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu;

/** Cleans a display name: no control / bidi-override characters, single spaces, trimmed. Empty = not set. */
export function normalizeName(name: unknown): Result<string> {
  if (name === undefined || name === null) return ok('');
  if (typeof name !== 'string') return fail('name-too-long');
  const cleaned = name.replace(UNSAFE_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (Array.from(cleaned).length > MAX_NAME_LENGTH) return fail('name-too-long');
  return ok(cleaned);
}
