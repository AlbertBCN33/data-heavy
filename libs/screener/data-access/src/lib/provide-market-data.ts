import {
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';

import { MarketDataPort } from './market-data.port';
import {
  SimulatedLatencyAdapter,
  type SimulationOptions,
} from './simulated-latency.adapter';
import { MARKET_SNAPSHOT_URL, StaticJsonAdapter } from './static-json.adapter';

export interface MarketDataConfig {
  /** Wrap the default adapter with simulated latency and failures. */
  readonly simulate?: SimulationOptions | false;
  /** Alternative snapshot file, e.g. the 50k-row stress dataset. */
  readonly snapshotUrl?: string;
}

/**
 * Registers the market data port. Requires `provideHttpClient()` in the application.
 *
 * ```ts
 * provideMarketData();                                  // bundled snapshot
 * provideMarketData({ simulate: DEFAULT_SIMULATION });  // + latency and failures
 * provideMarketData({ snapshotUrl: 'data/market-snapshot-50k.json' }); // stress test
 * ```
 */
export function provideMarketData(
  config: MarketDataConfig = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    StaticJsonAdapter,
    ...(config.snapshotUrl
      ? [{ provide: MARKET_SNAPSHOT_URL, useValue: config.snapshotUrl }]
      : []),
    {
      provide: MarketDataPort,
      useFactory: () => {
        const adapter = inject(StaticJsonAdapter);
        return config.simulate
          ? new SimulatedLatencyAdapter(adapter, config.simulate)
          : adapter;
      },
    },
  ]);
}
