import { createRandom, hashString } from '../random/prng';
import type { Instrument, PricePoint } from './instrument';

export interface PriceHistoryOptions {
  /** Last trading day of the series (ISO `YYYY-MM-DD`), usually the snapshot date. */
  readonly endDate: string;
  /** Number of trading days to generate, ending at `endDate`. */
  readonly tradingDays: number;
}

/**
 * Deterministic daily closes for an instrument: a random walk generated backwards from the
 * current price, so the last point always equals `instrument.price`. Volatility scales with
 * beta. Weekends are skipped; holidays are ignored.
 */
export function generatePriceHistory(
  instrument: Pick<Instrument, 'id' | 'price' | 'beta' | 'currency'>,
  { endDate, tradingDays }: PriceHistoryOptions,
): PricePoint[] {
  if (!Number.isInteger(tradingDays) || tradingDays < 1) {
    throw new RangeError(
      `tradingDays must be a positive integer, got ${tradingDays}`,
    );
  }
  const random = createRandom(hashString(instrument.id));
  const decimals = instrument.currency === 'JPY' ? 0 : 2;
  const dailyVol = 0.012 * Math.max(0.3, instrument.beta);
  const drift = random.normal(0.0003, 0.0004);

  const dates = tradingDaysEndingAt(endDate, tradingDays);
  const closes = new Array<number>(tradingDays);
  let price = instrument.price;
  for (let i = tradingDays - 1; i >= 0; i--) {
    closes[i] = round(price, decimals);
    // Walk backwards: divide by the forward return.
    price = Math.max(
      price / Math.exp(drift + random.normal(0, dailyVol)),
      0.01,
    );
  }
  return dates.map((date, i) => ({ date, close: closes[i] as number }));
}

function tradingDaysEndingAt(endDate: string, count: number): string[] {
  const end = parseIsoDate(endDate);
  const dates: string[] = [];
  const cursor = new Date(end);
  while (dates.length < count) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return dates.reverse();
}

function parseIsoDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RangeError(`Expected an ISO date (YYYY-MM-DD), got "${value}"`);
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`Invalid date "${value}"`);
  }
  return date;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
