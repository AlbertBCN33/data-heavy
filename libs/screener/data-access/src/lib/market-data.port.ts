import type { Instrument, PricePoint } from '@data-heavy/util';

export interface MarketData {
  /** Market date the data represents (ISO `YYYY-MM-DD`). */
  readonly asOf: string;
  readonly instruments: readonly Instrument[];
}

/**
 * Everything the app needs from "the backend". Features depend on this port only; adapters
 * decide where data comes from (a bundled snapshot today, an HTTP API tomorrow).
 *
 * Methods return promises so they plug into Angular's `resource()` and accept an `AbortSignal`
 * so superseded requests can be cancelled. Failures reject with {@link MarketDataError}.
 *
 * An abstract class rather than an interface so it can be used directly as a DI token.
 */
export abstract class MarketDataPort {
  abstract loadMarketData(signal?: AbortSignal): Promise<MarketData>;

  /** Daily closes for the last `tradingDays` sessions, oldest first. */
  abstract getPriceHistory(
    instrumentId: string,
    tradingDays: number,
    signal?: AbortSignal,
  ): Promise<readonly PricePoint[]>;

  /** Ids of watched instruments, in the order they were added. */
  abstract getWatchlist(signal?: AbortSignal): Promise<readonly string[]>;

  /** Idempotent: adding an instrument that is already watched succeeds. */
  abstract addToWatchlist(instrumentId: string): Promise<void>;

  /** Idempotent: removing an instrument that is not watched succeeds. */
  abstract removeFromWatchlist(instrumentId: string): Promise<void>;
}
