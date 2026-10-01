import { createRandom, type PricePoint, type Random } from '@data-heavy/util';

import { MarketDataError } from './market-data-error';
import { type MarketData, MarketDataPort } from './market-data.port';

export type MarketDataOperation =
  | 'loadMarketData'
  | 'getPriceHistory'
  | 'getWatchlist'
  | 'addToWatchlist'
  | 'removeFromWatchlist';

export interface SimulationOptions {
  /** Random latency range in milliseconds, inclusive. */
  readonly latencyMs: readonly [min: number, max: number];
  /** Probability (0–1) that an operation fails with a `network` error. */
  readonly failureRate: number;
  /** Operations that may fail. Defaults to all of them. */
  readonly failingOperations?: readonly MarketDataOperation[];
  /** Seed for reproducible latency and failures (tests, demos). */
  readonly seed?: number;
}

export const DEFAULT_SIMULATION: SimulationOptions = {
  latencyMs: [300, 1200],
  failureRate: 0.2,
  failingOperations: [
    'loadMarketData',
    'getPriceHistory',
    'addToWatchlist',
    'removeFromWatchlist',
  ],
};

const ALL_OPERATIONS: readonly MarketDataOperation[] = [
  'loadMarketData',
  'getPriceHistory',
  'getWatchlist',
  'addToWatchlist',
  'removeFromWatchlist',
];

/**
 * Decorator that adds random latency and failures to another adapter, so loading states,
 * retries, error states and optimistic-update rollback can be exercised on purpose.
 *
 * Latency is applied before the call and the failure is decided up front, so a failed
 * mutation never reaches the wrapped adapter: exactly what a lost request looks like.
 */
export class SimulatedLatencyAdapter extends MarketDataPort {
  private readonly random: Random;
  private readonly failing: ReadonlySet<MarketDataOperation>;

  constructor(
    private readonly inner: MarketDataPort,
    private readonly options: SimulationOptions = DEFAULT_SIMULATION,
  ) {
    super();
    const [min, max] = options.latencyMs;
    if (min < 0 || max < min) {
      throw new RangeError(`Invalid latency range [${min}, ${max}]`);
    }
    if (options.failureRate < 0 || options.failureRate > 1) {
      throw new RangeError(
        `failureRate must be between 0 and 1, got ${options.failureRate}`,
      );
    }
    this.random = createRandom(options.seed ?? Date.now());
    this.failing = new Set(options.failingOperations ?? ALL_OPERATIONS);
  }

  override loadMarketData(signal?: AbortSignal): Promise<MarketData> {
    return this.simulate('loadMarketData', signal, () =>
      this.inner.loadMarketData(signal),
    );
  }

  override getPriceHistory(
    instrumentId: string,
    tradingDays: number,
    signal?: AbortSignal,
  ): Promise<readonly PricePoint[]> {
    return this.simulate('getPriceHistory', signal, () =>
      this.inner.getPriceHistory(instrumentId, tradingDays, signal),
    );
  }

  override getWatchlist(signal?: AbortSignal): Promise<readonly string[]> {
    return this.simulate('getWatchlist', signal, () =>
      this.inner.getWatchlist(signal),
    );
  }

  override addToWatchlist(
    instrumentId: string,
    position?: number,
  ): Promise<void> {
    return this.simulate('addToWatchlist', undefined, () =>
      this.inner.addToWatchlist(instrumentId, position),
    );
  }

  override removeFromWatchlist(instrumentId: string): Promise<void> {
    return this.simulate('removeFromWatchlist', undefined, () =>
      this.inner.removeFromWatchlist(instrumentId),
    );
  }

  private async simulate<T>(
    operation: MarketDataOperation,
    signal: AbortSignal | undefined,
    call: () => Promise<T>,
  ): Promise<T> {
    const [min, max] = this.options.latencyMs;
    const latency = this.random.int(min, max);
    const fails =
      this.failing.has(operation) &&
      this.random.chance(this.options.failureRate);

    await delay(latency, signal);
    if (fails) {
      throw new MarketDataError(
        'network',
        `Simulated failure in ${operation} after ${latency} ms`,
      );
    }
    return call();
  }
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () =>
      new MarketDataError('aborted', 'The request was aborted', {
        cause: signal?.reason,
      });
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
