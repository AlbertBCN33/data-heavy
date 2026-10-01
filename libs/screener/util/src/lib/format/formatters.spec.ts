import { getFormatters, MISSING_VALUE } from './formatters';

// Intl output uses non-breaking and narrow spaces; normalise them so expectations stay readable.
const INTL_SPACES = new RegExp(`[${String.fromCharCode(0x00a0, 0x202f)}]`, 'g');
const normalise = (value: string): string => value.replace(INTL_SPACES, ' ');

describe('getFormatters', () => {
  const en = getFormatters('en-US');
  const es = getFormatters('es-ES');

  it('caches formatters per locale', () => {
    expect(getFormatters('en-US')).toBe(en);
    expect(en.locale).toBe('en-US');
  });

  it('formats prices with currency-specific decimals', () => {
    expect(en.price(1234.5, 'USD')).toBe('$1,234.50');
    expect(en.price(2500, 'JPY')).toBe('¥2,500');
    expect(normalise(es.price(1234.5, 'EUR'))).toBe('1234,50 €');
    expect(normalise(es.price(12345.5, 'EUR'))).toBe('12.345,50 €');
  });

  it('formats percentages, with an explicit sign when requested', () => {
    expect(en.percent(2.5)).toBe('2.50%');
    expect(en.signedPercent(2.5)).toBe('+2.50%');
    expect(en.signedPercent(-1.2)).toBe('-1.20%');
    expect(en.signedPercent(0)).toBe('0.00%');
    expect(normalise(es.signedPercent(-1.2))).toBe('-1,20 %');
  });

  it('formats compact numbers and USD amounts', () => {
    expect(en.compact(1_250_000)).toBe('1.3M');
    expect(en.compactUsd(2.4e12)).toBe('$2.4T');
    expect(normalise(es.compact(1_250_000))).toBe('1,3 M');
  });

  it('formats ratios and integers', () => {
    expect(en.ratio(15.234)).toBe('15.23');
    expect(en.ratio(null)).toBe(MISSING_VALUE);
    expect(en.integer(1234567.8)).toBe('1,234,568');
    expect(es.integer(1234567)).toBe('1.234.567');
  });

  it('formats ISO dates in UTC regardless of the local time zone', () => {
    expect(en.date('2026-09-30')).toBe('Sep 30, 2026');
    expect(es.date('2026-09-30')).toBe('30 sept 2026');
    expect(en.date('not-a-date')).toBe(MISSING_VALUE);
  });

  it('shows a dash for non-finite numbers', () => {
    expect(en.price(Number.NaN, 'USD')).toBe(MISSING_VALUE);
    expect(en.percent(Infinity)).toBe(MISSING_VALUE);
  });

  it('formats cells by column format', () => {
    expect(en.cell('text', 'ABC', 'USD')).toBe('ABC');
    expect(en.cell('price', 10, 'GBP')).toBe('£10.00');
    expect(en.cell('percent', 3, 'USD')).toBe('3.00%');
    expect(en.cell('signedPercent', 3, 'USD')).toBe('+3.00%');
    expect(en.cell('compact', 1500, 'USD')).toBe('1.5K');
    expect(en.cell('compactUsd', 1500, 'EUR')).toBe('$1.5K');
    expect(en.cell('ratio', 2, 'USD')).toBe('2.00');
    expect(en.cell('ratio', null, 'USD')).toBe(MISSING_VALUE);
    expect(en.cell('price', 'oops', 'USD')).toBe(MISSING_VALUE);
  });
});
