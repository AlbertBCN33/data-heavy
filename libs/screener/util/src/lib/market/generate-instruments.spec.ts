import { generateInstruments } from './generate-instruments';
import { EXCHANGE_INFO, INSTRUMENT_ID_PATTERN } from './instrument';

describe('generateInstruments', () => {
  const rows = generateInstruments(42, 2_000);

  it('is deterministic for a given seed', () => {
    expect(generateInstruments(42, 50)).toEqual(rows.slice(0, 50));
    expect(generateInstruments(43, 50)).not.toEqual(rows.slice(0, 50));
  });

  it('returns the requested number of rows with unique, well-formed ids', () => {
    expect(rows).toHaveLength(2_000);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_000);
    for (const row of rows) {
      expect(row.id).toMatch(INSTRUMENT_ID_PATTERN);
      expect(row.id).toBe(`${row.exchange}:${row.symbol}`);
    }
  });

  it('keeps every row internally consistent', () => {
    for (const row of rows) {
      expect(row.country).toBe(EXCHANGE_INFO[row.exchange].country);
      expect(row.currency).toBe(EXCHANGE_INFO[row.exchange].currency);
      expect(row.low52w).toBeLessThanOrEqual(row.price);
      expect(row.high52w).toBeGreaterThanOrEqual(row.price);
      expect(row.price).toBeGreaterThan(0);
      expect(row.marketCapUsd).toBeGreaterThan(0);
      expect(row.volume).toBeGreaterThanOrEqual(0);
      expect(row.dividendYield).toBeGreaterThanOrEqual(0);
      if (row.type === 'etf') {
        expect(row.peRatio).toBeNull();
        expect(row.name).toMatch(/ETF$/);
      }
      if (row.exchange === 'TSE') {
        expect(row.symbol).toMatch(/^\d{4}$/);
        expect(Number.isInteger(row.price)).toBe(true);
      }
    }
  });

  it('produces a realistic mix of instruments', () => {
    const etfShare = rows.filter((r) => r.type === 'etf').length / rows.length;
    expect(etfShare).toBeGreaterThan(0.1);
    expect(etfShare).toBeLessThan(0.2);
    expect(rows.some((r) => r.type === 'equity' && r.peRatio === null)).toBe(
      true,
    );
    expect(new Set(rows.map((r) => r.exchange)).size).toBe(7);
  });

  it('handles zero and rejects invalid counts', () => {
    expect(generateInstruments(1, 0)).toEqual([]);
    expect(() => generateInstruments(1, -1)).toThrow(RangeError);
    expect(() => generateInstruments(1, 1.5)).toThrow(RangeError);
  });
});
