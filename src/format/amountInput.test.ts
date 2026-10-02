import { describe, expect, it } from 'vitest';
import { displayFromRaw, rawFromText, rawDecimalMark } from './amountInput';

const ctx = (locale: string, currency = 'EUR') => ({ locale, currency });
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

describe('rawFromText', () => {
  it('keeps digits and one decimal mark, at most two decimals', () => {
    expect(rawFromText('12abc3', ctx('en-US'))).toBe('123');
    expect(rawFromText('12.345', ctx('en-US'))).toBe('12.34');
    expect(rawFromText('1.2.3', ctx('en-US'))).toBe('1.23');
    expect(rawFromText('007', ctx('en-US'))).toBe('7');
    expect(rawFromText('.5', ctx('en-US'))).toBe('0.5');
    expect(rawFromText('-5', ctx('en-US'))).toBe('5');
    expect(rawFromText('', ctx('en-US'))).toBe('');
  });

  it("ignores the locale's own thousands separator, so grouped text round-trips", () => {
    expect(rawFromText('200,000', ctx('en-US'))).toBe('200000');
    expect(rawFromText('1.234.567,5', ctx('de-DE'))).toBe('1234567,5');
    expect(rawFromText('2 450,5', ctx('ru-RU'))).toBe('2450,5');
    expect(rawFromText('12,34,567', ctx('hi-IN'))).toBe('1234567');
  });

  it('accepts either key as the decimal mark when it is not the locale grouping mark', () => {
    expect(rawFromText('12,5', ctx('ru-RU'))).toBe('12,5'); // ru groups with a space
    expect(rawFromText('12.5', ctx('ru-RU'))).toBe('12,5'); // …so "." can only be a decimal
    expect(rawFromText('12.5', ctx('en-US'))).toBe('12.5');
  });

  it('reads any numeral system', () => {
    expect(rawFromText('٢٥٠٫٥', ctx('ar-EG'))).toBe('250.5');
    expect(rawFromText('۲۵۰', ctx('ur-PK'))).toBe('250');
    expect(rawFromText('२५०००', ctx('hi-IN'))).toBe('25000');
    expect(rawFromText('২৫০.৫', ctx('bn-BD'))).toBe('250.5');
    expect(rawFromText('２５０', ctx('ja-JP'))).toBe('250');
  });

  it('allows no decimals in zero-decimal currencies', () => {
    expect(rawFromText('1500.50', ctx('ja-JP', 'JPY'))).toBe('150050');
  });

  it('caps the whole part so the field cannot grow forever', () => {
    expect(rawFromText('1'.repeat(30), ctx('en-US'))).toHaveLength(10);
  });

  it('exposes the raw decimal mark per locale', () => {
    expect(rawDecimalMark('en-US')).toBe('.');
    expect(rawDecimalMark('de-DE')).toBe(',');
    expect(rawDecimalMark('ar-EG')).toBe('.'); // ٫ normalised
  });
});

describe('displayFromRaw', () => {
  it('writes numbers the way each locale does', () => {
    expect(displayFromRaw('200000', ctx('en-US')).text).toBe('200,000');
    expect(plain(displayFromRaw('200000', ctx('ru-RU')).text)).toBe('200 000');
    expect(displayFromRaw('1234567,5', ctx('de-DE')).text).toBe('1.234.567,5');
    expect(displayFromRaw('1234567', ctx('hi-IN')).text).toBe('12,34,567'); // lakh grouping
    expect(displayFromRaw('2450.5', ctx('ar-EG')).text).toBe('٢٬٤٥٠٫٥');
    expect(displayFromRaw('1234.5', ctx('bn-BD')).text).toBe('১,২৩৪.৫');
    expect(displayFromRaw('1234', ctx('es-ES')).text).toBe('1234'); // Spanish skips grouping below 5 digits
    expect(displayFromRaw('12345', ctx('es-ES')).text).toBe('12.345');
  });

  it('keeps leading zeros in decimals and a trailing mark while typing', () => {
    expect(displayFromRaw('12.05', ctx('en-US')).text).toBe('12.05');
    expect(displayFromRaw('12.', ctx('en-US')).text).toBe('12.');
    expect(displayFromRaw('0.', ctx('en-US')).text).toBe('0.');
    expect(displayFromRaw('', ctx('en-US')).text).toBe('');
  });

  it('is the inverse of rawFromText', () => {
    for (const locale of ['en-US', 'de-DE', 'ru-RU', 'fr-FR', 'hi-IN', 'ar-EG', 'ar', 'bn-BD', 'ja-JP', 'pt-BR', 'es-ES', 'id-ID', 'ur-PK']) {
      for (const raw of ['', '7', '1234', '123456', '1234567', '12.5', '0.05', '999999999']) {
        const localRaw = raw.replace('.', rawDecimalMark(locale));
        const shown = displayFromRaw(localRaw, ctx(locale)).text;
        expect(rawFromText(shown, ctx(locale)), `${locale} ${raw}`).toBe(localRaw);
      }
    }
  });

  it('maps the caret through the inserted separators', () => {
    const shown = displayFromRaw('1234567', ctx('en-US')); // 1,234,567
    expect(shown.text).toBe('1,234,567');
    expect(shown.caretFor(0)).toBe(0);
    expect(shown.caretFor(1)).toBe(1); // 1|
    expect(shown.caretFor(2)).toBe(3); // 1,2|
    expect(shown.caretFor(4)).toBe(5); // 1,234|
    expect(shown.caretFor(7)).toBe(9);
    expect(shown.caretFor(99)).toBe(9);
    const decimal = displayFromRaw('1234.5', ctx('en-US')); // 1,234.5
    expect(decimal.caretFor(4)).toBe(5);
    expect(decimal.caretFor(5)).toBe(6); // after the "."
    expect(decimal.caretFor(6)).toBe(7);
  });
});
