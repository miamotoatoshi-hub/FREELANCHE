import { describe, expect, it } from 'vitest';
import {
  amountToInput,
  currencyFractionDigits,
  fromMajor,
  MAX_AMOUNT,
  parseAmountInput,
  sanitizeAmountInput,
} from './money';

const parse = (text: string, currency = 'EUR') => {
  const result = parseAmountInput(text, currency);
  return result.ok ? result.amount : result.error;
};

describe('parseAmountInput', () => {
  it('reads whole amounts quickly', () => {
    expect(parse('150')).toBe(15000);
    expect(parse('0')).toBe(0);
    expect(parse('  42 ')).toBe(4200);
  });

  it('accepts either decimal mark', () => {
    expect(parse('125.5')).toBe(12550);
    expect(parse('125,5')).toBe(12550);
    expect(parse('125.50')).toBe(12550);
    expect(parse('125,05')).toBe(12505);
    expect(parse('.5')).toBe(50);
    expect(parse(',75')).toBe(75);
    expect(parse('12,')).toBe(1200);
  });

  it('reads thousands separators', () => {
    expect(parse('1,250')).toBe(125000);
    expect(parse('1.250')).toBe(125000);
    expect(parse('1 250')).toBe(125000);
    expect(parse('1\u00a0250,40')).toBe(125040);
    expect(parse('1,234,567')).toBe(123456700);
    expect(parse('1.234,50')).toBe(123450);
    expect(parse('1,234.50')).toBe(123450);
  });

  it('is exact where floating point is not', () => {
    expect(parse('0.1')).toBe(10);
    expect(parse('0.29')).toBe(29);
    expect(parse('19.99')).toBe(1999);
    expect(parse('1.15')).toBe(115);
  });

  it('rejects empty, junk, NaN and infinity', () => {
    expect(parse('')).toBe('amount-empty');
    expect(parse('   ')).toBe('amount-empty');
    expect(parse('abc')).toBe('amount-invalid');
    expect(parse('12abc')).toBe('amount-invalid');
    expect(parse('NaN')).toBe('amount-invalid');
    expect(parse('Infinity')).toBe('amount-invalid');
    expect(parse('-5')).toBe('amount-invalid');
    expect(parse('1e5')).toBe('amount-invalid');
    expect(parse('.')).toBe('amount-invalid');
    expect(parse('1..5')).toBe('amount-invalid');
    expect(parse('1,2,3')).toBe('amount-invalid');
    expect(parse('12,3456')).toBe('amount-decimals');
    expect(parse('0.500')).toBe('amount-decimals');
  });

  it('enforces the maximum', () => {
    expect(parse('100000000')).toBe(MAX_AMOUNT);
    expect(parse('100000001')).toBe('amount-too-large');
    expect(parse('99999999999999999999')).toBe('amount-too-large');
  });

  it('does not allow decimals in zero-decimal currencies', () => {
    expect(parse('1500', 'JPY')).toBe(150000);
    expect(parse('1500.00', 'JPY')).toBe(150000);
    expect(parse('1500.5', 'JPY')).toBe('amount-decimals');
  });
});

describe('sanitizeAmountInput', () => {
  it('keeps digits, one mark and two decimals', () => {
    expect(sanitizeAmountInput('12a3', 'EUR')).toBe('123');
    expect(sanitizeAmountInput('12.345', 'EUR')).toBe('12.34');
    expect(sanitizeAmountInput('1.2.3', 'EUR')).toBe('1.23');
    expect(sanitizeAmountInput('12,5', 'EUR')).toBe('12,5');
    expect(sanitizeAmountInput('-5', 'EUR')).toBe('5');
    expect(sanitizeAmountInput('007', 'EUR')).toBe('7');
    expect(sanitizeAmountInput('0.5', 'EUR')).toBe('0.5');
  });

  it('drops decimal marks for zero-decimal currencies', () => {
    expect(sanitizeAmountInput('1500.50', 'JPY')).toBe('150050');
  });
});

describe('amountToInput / fromMajor', () => {
  it('renders stored amounts for an editable field', () => {
    expect(amountToInput(15000, 'EUR')).toBe('150');
    expect(amountToInput(12550, 'EUR')).toBe('125.5');
    expect(amountToInput(12505, 'EUR', ',')).toBe('125,05');
    expect(amountToInput(150000, 'JPY')).toBe('1500');
  });

  it('round-trips through the parser', () => {
    for (const amount of [1, 50, 99, 100, 12550, 12505, 99999999]) {
      expect(parse(amountToInput(amount, 'EUR'))).toBe(amount);
    }
  });

  it('converts major units without drift', () => {
    expect(fromMajor(0.1 + 0.2)).toBe(30);
    expect(fromMajor(1234.56)).toBe(123456);
  });

  it('knows fraction digits per currency', () => {
    expect(currencyFractionDigits('EUR')).toBe(2);
    expect(currencyFractionDigits('JPY')).toBe(0);
  });
});
