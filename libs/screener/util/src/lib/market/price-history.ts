import { createRandom, hashString } from '../random/prng';
import type { Instrument, PricePoint } from './instrument';

export interface PriceHistoryOptions {
  /** Last trading day of the series (ISO `YYYY-MM-DD`), usually the snapshot date. */
  readonly endDate: string;
  /** Number of trading days to generate, ending at `endDate`. */
  readonly tradingDays: number;
}

/** The fields that determine an instrument's price series. */
export type PriceSeriesSource = Pick<
  Instrument,
  'id' | 'price' | 'changePct' | 'beta' | 'currency'
>;

/** Trading days in the one-year window used for the 52-week high and low. */
export const TRADING_DAYS_PER_YEAR = 252;

/**
 * Deterministic daily closes, oldest first: a random walk generated backwards from the current
 * price. The last close equals `price`, the one before it reflects `changePct`, and volatility
 * scales with beta. Because the walk starts from today, a shorter series is exactly the tail of a
 * longer one, so every chart range and the 52-week high/low agree.
 */
export function generateCloses(
  instrument: PriceSeriesSource,
  tradingDays: number,
): number[] {
  if (!Number.isInteger(tradingDays) || tradingDays < 1) {
    throw new RangeError(
      `tradingDays must be a positive integer, got ${tradingDays}`,
    );
  }
  const random = createRandom(hashString(instrument.id));
  const decimals = instrument.currency === 'JPY' ? 0 : 2;
  const dailyVol = 0.012 * Math.max(0.3, instrument.beta);
  const drift = random.normal(0.0003, 0.0004);

  const closes = new Array<number>(tradingDays);
  let price = instrument.price;
  for (let i = tradingDays - 1; i >= 0; i--) {
    closes[i] = round(price, decimals);
    // Walk backwards: divide by the forward return. The first step back is today's change.
    const back =
      i === tradingDays - 1
        ? 1 + instrument.changePct / 100
        : Math.exp(drift + random.normal(0, dailyVol));
    price = Math.max(price / back, 0.01);
  }
  return closes;
}

/** {@link generateCloses} with trading dates (weekdays; holidays are ignored). */
export function generatePriceHistory(
  instrument: PriceSeriesSource,
  { endDate, tradingDays }: PriceHistoryOptions,
): PricePoint[] {
  const closes = generateCloses(instrument, tradingDays);
  const dates = tradingDaysEndingAt(endDate, tradingDays);
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
