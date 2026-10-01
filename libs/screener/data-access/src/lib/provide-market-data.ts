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
import { StaticJsonAdapter } from './static-json.adapter';

export interface MarketDataConfig {
  /** Wrap the default adapter with simulated latency and failures. */
  readonly simulate?: SimulationOptions | false;
}

/**
 * Registers the market data port. Requires `provideHttpClient()` in the application.
 *
 * ```ts
 * provideMarketData();                                  // bundled snapshot
 * provideMarketData({ simulate: DEFAULT_SIMULATION });  // + latency and failures
 * ```
 */
export function provideMarketData(
  config: MarketDataConfig = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    StaticJsonAdapter,
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
