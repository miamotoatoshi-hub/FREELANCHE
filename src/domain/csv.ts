import { isValidLocalDate } from './dates';
import { currencyFractionDigits, parseAmountInput, STORAGE_SCALE } from './money';
import type { ImportRow } from './usecases';
import type { IncomeEntry } from './types';
import { MAX_NOTE_LENGTH } from './validation';

/**
 * CSV export/import. The format is deliberately unambiguous for spreadsheets:
 * comma-separated, ISO dates, a plain `.` decimal mark and no thousands marks.
 */

export const CSV_HEADER = ['Date', 'Amount', 'Currency', 'Note'] as const;

/** Cells starting with these are read as formulas by spreadsheets. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function formatCsvAmount(amount: number, currency: string): string {
  const whole = Math.trunc(amount / STORAGE_SCALE);
  const hundredths = amount % STORAGE_SCALE;
  if (currencyFractionDigits(currency) === 0 || hundredths === 0) return String(whole);
  return `${whole}.${String(hundredths).padStart(2, '0')}`;
}

function escapeCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 with a byte-order mark so Excel reads non-Latin notes correctly. */
export function exportEntriesCsv(entries: readonly IncomeEntry[]): string {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  const lines = [CSV_HEADER.join(',')];
  for (const entry of sorted) {
    lines.push(
      [entry.date, formatCsvAmount(entry.amount, entry.currency), entry.currency, escapeCell(entry.note ?? '')].join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Minimal RFC-4180 parser: quoted cells, escaped quotes, CRLF or LF. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export type ImportParse =
  | { ok: true; rows: ImportRow[]; invalid: number; otherCurrency: number }
  | { ok: false; error: 'empty' | 'format' };

/**
 * Reads a CSV into import rows. Rows in a different currency than `currency`
 * are counted and left out (the app keeps a single currency); malformed rows
 * are counted, never guessed at.
 */
export function parseEntriesCsv(input: string, currency: string): ImportParse {
  const text = input.replace(/^\uFEFF/, '');
  if (text.trim() === '') return { ok: false, error: 'empty' };

  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(',') || !firstLine.includes(';') ? ',' : ';';
  const table = parseCsv(text, delimiter);
  const header = (table[0] ?? []).map((cell) => cell.trim().toLowerCase());
  const dateColumn = header.indexOf('date');
  const amountColumn = header.indexOf('amount');
  if (dateColumn === -1 || amountColumn === -1) return { ok: false, error: 'format' };
  const currencyColumn = header.indexOf('currency');
  const noteColumn = header.indexOf('note');

  const rows: ImportRow[] = [];
  let invalid = 0;
  let otherCurrency = 0;

  for (const cells of table.slice(1)) {
    const date = (cells[dateColumn] ?? '').trim();
    const rowCurrency = currencyColumn === -1 ? currency : (cells[currencyColumn] ?? '').trim().toUpperCase() || currency;
    if (rowCurrency !== currency) {
      otherCurrency += 1;
      continue;
    }
    const amount = parseAmountInput(cells[amountColumn] ?? '', currency);
    if (!isValidLocalDate(date) || !amount.ok || amount.amount <= 0) {
      invalid += 1;
      continue;
    }
    let note = noteColumn === -1 ? '' : (cells[noteColumn] ?? '').trim();
    // Undo the export's formula guard ('=SUM… was written as '=SUM…).
    if (/^'[=+\-@]/.test(note)) note = note.slice(1);
    if (note.length > MAX_NOTE_LENGTH) {
      invalid += 1;
      continue;
    }
    rows.push({ date, amount: amount.amount, ...(note ? { note } : {}) });
  }
  return { ok: true, rows, invalid, otherCurrency };
}
