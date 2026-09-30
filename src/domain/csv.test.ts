import { describe, expect, it } from 'vitest';
import { entry, m } from '../test/helpers';
import { exportEntriesCsv, formatCsvAmount, parseCsv, parseEntriesCsv } from './csv';

describe('exportEntriesCsv', () => {
  it('writes the documented columns with plain, unambiguous values', () => {
    const csv = exportEntriesCsv([entry('2026-09-03', 300, { note: 'Logo' }), entry('2026-09-01', 150.5, { note: 'Website' })]);
    expect(csv).toBe('\uFEFFDate,Amount,Currency,Note\r\n2026-09-01,150.50,EUR,Website\r\n2026-09-03,300,EUR,Logo\r\n');
  });

  it('quotes cells that contain commas, quotes or newlines', () => {
    const csv = exportEntriesCsv([entry('2026-09-01', 10, { note: 'a "b", c' })]);
    expect(csv).toContain('"a ""b"", c"');
  });

  it('neutralises spreadsheet formulas', () => {
    const csv = exportEntriesCsv([entry('2026-09-01', 10, { note: '=HYPERLINK("x")' })]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('formats zero-decimal currencies without fractions', () => {
    expect(formatCsvAmount(150000, 'JPY')).toBe('1500');
    expect(formatCsvAmount(12505, 'EUR')).toBe('125.05');
  });
});

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, blank lines and both line endings', () => {
    expect(parseCsv('a,"b,1","c ""q"""\r\n\r\nx,y,z\n')).toEqual([
      ['a', 'b,1', 'c "q"'],
      ['x', 'y', 'z'],
    ]);
  });
});

describe('parseEntriesCsv', () => {
  it('round-trips an export', () => {
    const original = [
      entry('2026-09-01', 150.5, { note: 'Website, phase 1' }),
      entry('2026-09-03', 300),
      entry('2026-09-04', 20, { note: '-refund' }),
    ];
    const parsed = parseEntriesCsv(exportEntriesCsv(original), 'EUR');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.rows).toEqual([
      { date: '2026-09-01', amount: m(150.5), note: 'Website, phase 1' },
      { date: '2026-09-03', amount: m(300) },
      { date: '2026-09-04', amount: m(20), note: '-refund' },
    ]);
    expect(parsed.invalid).toBe(0);
  });

  it('counts bad rows instead of guessing', () => {
    const csv = 'Date,Amount,Currency,Note\n2026-09-01,100,EUR,ok\nnot-a-date,50,EUR,\n2026-09-02,-5,EUR,\n2026-09-02,abc,EUR,\n2026-02-30,5,EUR,\n';
    const parsed = parseEntriesCsv(csv, 'EUR');
    expect(parsed.ok && parsed.rows).toHaveLength(1);
    expect(parsed.ok && parsed.invalid).toBe(4);
  });

  it('leaves out rows in another currency and reports how many', () => {
    const csv = 'Date,Amount,Currency,Note\n2026-09-01,100,EUR,\n2026-09-02,100,USD,\n';
    const parsed = parseEntriesCsv(csv, 'EUR');
    expect(parsed.ok && parsed.rows).toHaveLength(1);
    expect(parsed.ok && parsed.otherCurrency).toBe(1);
  });

  it('reads semicolon-separated files from European spreadsheets', () => {
    const parsed = parseEntriesCsv('Date;Amount;Currency;Note\n2026-09-01;125,50;EUR;Logo\n', 'EUR');
    expect(parsed.ok && parsed.rows).toEqual([{ date: '2026-09-01', amount: m(125.5), note: 'Logo' }]);
  });

  it('accepts files without a currency or note column', () => {
    const parsed = parseEntriesCsv('date,amount\n2026-09-01,10\n', 'EUR');
    expect(parsed.ok && parsed.rows).toEqual([{ date: '2026-09-01', amount: m(10) }]);
  });

  it('reports empty and unrecognised files', () => {
    expect(parseEntriesCsv('   ', 'EUR')).toEqual({ ok: false, error: 'empty' });
    expect(parseEntriesCsv('foo,bar\n1,2\n', 'EUR')).toEqual({ ok: false, error: 'format' });
  });
});
