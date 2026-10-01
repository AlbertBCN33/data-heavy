import { MarketDataError } from './market-data-error';
import { type MarketData, MarketDataPort } from './market-data.port';
import {
  DEFAULT_SIMULATION,
  SimulatedLatencyAdapter,
  type SimulationOptions,
} from './simulated-latency.adapter';

class FakePort extends MarketDataPort {
  readonly calls: string[] = [];
  override async loadMarketData(): Promise<MarketData> {
    this.calls.push('loadMarketData');
    return { asOf: '2026-09-30', instruments: [] };
  }
  override async getPriceHistory(id: string, days: number) {
    this.calls.push(`getPriceHistory:${id}:${days}`);
    return [{ date: '2026-09-30', close: 1 }];
  }
  override async getWatchlist() {
    this.calls.push('getWatchlist');
    return ['NYSE:ABC'];
  }
  override async addToWatchlist(id: string) {
    this.calls.push(`add:${id}`);
  }
  override async removeFromWatchlist(id: string) {
    this.calls.push(`remove:${id}`);
  }
}

function create(options: Partial<SimulationOptions> = {}) {
  const inner = new FakePort();
  const adapter = new SimulatedLatencyAdapter(inner, {
    latencyMs: [100, 100],
    failureRate: 0,
    seed: 1,
    ...options,
  });
  return { inner, adapter };
}

async function settle<T>(promise: Promise<T>, ms: number) {
  const outcome = promise.then(
    (value) => ({ value, error: null }),
    (error: unknown) => ({ value: null, error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return outcome;
}

describe('SimulatedLatencyAdapter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delays every call by the configured latency, then delegates', async () => {
    const { inner, adapter } = create();
    let resolved = false;
    const pending = adapter.loadMarketData().then((v) => {
      resolved = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(99);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ asOf: '2026-09-30', instruments: [] });
    expect(inner.calls).toEqual(['loadMarketData']);
  });

  it('delegates every operation with its arguments', async () => {
    const { inner, adapter } = create();
    await settle(adapter.getPriceHistory('NYSE:ABC', 5), 100);
    await settle(adapter.getWatchlist(), 100);
    await settle(adapter.addToWatchlist('NYSE:ABC'), 100);
    await settle(adapter.removeFromWatchlist('NYSE:ABC'), 100);
    expect(inner.calls).toEqual([
      'getPriceHistory:NYSE:ABC:5',
      'getWatchlist',
      'add:NYSE:ABC',
      'remove:NYSE:ABC',
    ]);
  });

  it('fails with a retryable network error without reaching the wrapped adapter', async () => {
    const { inner, adapter } = create({ failureRate: 1 });
    const { error } = await settle(adapter.addToWatchlist('NYSE:ABC'), 100);
    expect(error).toBeInstanceOf(MarketDataError);
    expect((error as MarketDataError).kind).toBe('network');
    expect((error as MarketDataError).retryable).toBe(true);
    expect(inner.calls).toEqual([]);
  });

  it('only fails the configured operations', async () => {
    const { adapter } = create({
      failureRate: 1,
      failingOperations: ['addToWatchlist'],
    });
    expect((await settle(adapter.getWatchlist(), 100)).error).toBeNull();
    expect(
      (await settle(adapter.addToWatchlist('NYSE:ABC'), 100)).error,
    ).not.toBeNull();
  });

  it('is reproducible for a given seed', async () => {
    const outcomes = async () => {
      const { adapter } = create({ failureRate: 0.5, latencyMs: [10, 500] });
      const results: boolean[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(
          (await settle(adapter.getWatchlist(), 500)).error === null,
        );
      }
      return results;
    };
    const a = await outcomes();
    expect(await outcomes()).toEqual(a);
    expect(a).toContain(true);
    expect(a).toContain(false);
  });

  it('rejects with an aborted error when aborted before or during the delay', async () => {
    const { inner, adapter } = create();
    const before = await settle(
      adapter.loadMarketData(AbortSignal.abort()),
      100,
    );
    expect((before.error as MarketDataError).kind).toBe('aborted');

    const controller = new AbortController();
    const during = adapter.getPriceHistory('NYSE:ABC', 5, controller.signal);
    await vi.advanceTimersByTimeAsync(50);
    controller.abort();
    const { error } = await settle(during, 100);
    expect((error as MarketDataError).kind).toBe('aborted');
    expect(inner.calls).toEqual([]);
  });

  it('validates its options', () => {
    const inner = new FakePort();
    expect(
      () =>
        new SimulatedLatencyAdapter(inner, {
          latencyMs: [10, 5],
          failureRate: 0,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new SimulatedLatencyAdapter(inner, {
          latencyMs: [-1, 5],
          failureRate: 0,
        }),
    ).toThrow(RangeError);
    expect(
      () =>
        new SimulatedLatencyAdapter(inner, {
          latencyMs: [0, 5],
          failureRate: 1.5,
        }),
    ).toThrow(RangeError);
    expect(() => new SimulatedLatencyAdapter(inner)).not.toThrow();
    expect(DEFAULT_SIMULATION.failingOperations).not.toContain('getWatchlist');
  });
});
