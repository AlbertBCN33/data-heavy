import { generatePriceHistory } from './price-history';

const instrument = {
  id: 'NYSE:ABC',
  price: 123.45,
  beta: 1.2,
  currency: 'USD',
} as const;

describe('generatePriceHistory', () => {
  const history = generatePriceHistory(instrument, {
    endDate: '2026-09-30',
    tradingDays: 260,
  });

  it('returns the requested number of points ending at the current price', () => {
    expect(history).toHaveLength(260);
    expect(history.at(-1)).toEqual({ date: '2026-09-30', close: 123.45 });
  });

  it('only contains weekdays in ascending order', () => {
    for (let i = 0; i < history.length; i++) {
      const point = history[i] as (typeof history)[number];
      const day = new Date(`${point.date}T00:00:00Z`).getUTCDay();
      expect(day).not.toBe(0);
      expect(day).not.toBe(6);
      if (i > 0) {
        expect(point.date > (history[i - 1] as typeof point).date).toBe(true);
      }
      expect(point.close).toBeGreaterThan(0);
    }
  });

  it('skips a weekend end date back to the previous Friday', () => {
    const fromSunday = generatePriceHistory(instrument, {
      endDate: '2026-09-27',
      tradingDays: 3,
    });
    expect(fromSunday.map((p) => p.date)).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('is deterministic per instrument', () => {
    const again = generatePriceHistory(instrument, {
      endDate: '2026-09-30',
      tradingDays: 260,
    });
    const other = generatePriceHistory(
      { ...instrument, id: 'NYSE:XYZ' },
      { endDate: '2026-09-30', tradingDays: 260 },
    );
    expect(again).toEqual(history);
    expect(other).not.toEqual(history);
  });

  it('uses whole numbers for zero-decimal currencies', () => {
    const yen = generatePriceHistory(
      { id: 'TSE:7203', price: 2500, beta: 0.9, currency: 'JPY' },
      { endDate: '2026-09-30', tradingDays: 20 },
    );
    expect(yen.every((p) => Number.isInteger(p.close))).toBe(true);
  });

  it('rejects invalid input', () => {
    expect(() =>
      generatePriceHistory(instrument, {
        endDate: '2026-02-30',
        tradingDays: 5,
      }),
    ).toThrow(RangeError);
    expect(() =>
      generatePriceHistory(instrument, {
        endDate: '30/09/2026',
        tradingDays: 5,
      }),
    ).toThrow(RangeError);
    expect(() =>
      generatePriceHistory(instrument, {
        endDate: '2026-09-30',
        tradingDays: 0,
      }),
    ).toThrow(RangeError);
  });
});
